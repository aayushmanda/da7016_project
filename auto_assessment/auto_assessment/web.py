import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auto_assessment.web")
import io
import json
import re
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from starlette.datastructures import FormData
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import asyncio
from document_parser import extract_content_from_file
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from google import genai
from openai import OpenAI
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token
from google.genai import types
from google.genai.types import LiveConnectConfig, Modality
from dotenv import load_dotenv
from agent import (
    AssessmentReport,
    RegradeRequest,
    RubricAssessmentAgent,
    TRANSCRIPTION_MODEL,
    GRADING_MODEL,
    CHAT_MODEL,
    needs_visual_grading,
)

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    assessment_id: Optional[str] = None
    messages: List[ChatMessage]

class GoogleAuthRequest(BaseModel):
    credential: str

app = FastAPI(title="Auto Assessment API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = Path(__file__).with_name("assessment_history.db")
BODHAN_API_KEY = os.getenv("BODHAN_API_KEY", "").strip()
BODHAN_BASE_URL = "https://api.bodhan.ai/v1"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_ALLOWED_DOMAINS = {
    domain.strip().lower()
    for domain in os.getenv("GOOGLE_ALLOWED_DOMAINS", "").split(",")
    if domain.strip()
}
QUESTION_HINTS = ("question", "ques", "qp", "paper", "rubric")
STUDENT_HINTS = ("student", "answer", "submission", "response", "solution")
BATCH_CONCURRENCY = max(1, int(os.getenv("BATCH_CONCURRENCY", "3")))
_assessment_system: Optional[RubricAssessmentAgent] = None
_tts_client: Optional[OpenAI] = None


def get_assessment_system() -> RubricAssessmentAgent:
    global _assessment_system
    if _assessment_system is None:
        _assessment_system = RubricAssessmentAgent()
    return _assessment_system


def get_tts_client() -> OpenAI:
    global _tts_client
    if _tts_client is None:
        if not BODHAN_API_KEY:
            raise HTTPException(
                status_code=500,
                detail="BODHAN_API_KEY environment variable is missing.",
            )
        _tts_client = OpenAI(base_url=BODHAN_BASE_URL, api_key=BODHAN_API_KEY)
    return _tts_client


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS assessments (
                assessment_id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                question_paper_filename TEXT NOT NULL DEFAULT '',
                student_filename TEXT NOT NULL DEFAULT '',
                score REAL NOT NULL,
                max_score REAL NOT NULL,
                report_json TEXT NOT NULL,
                context_json TEXT NOT NULL
            )
        """)

        # Migration for databases created before session_id existed.
        columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(assessments)"
            ).fetchall()
        }

        if "session_id" not in columns:
            connection.execute(
                "ALTER TABLE assessments "
                "ADD COLUMN session_id TEXT NOT NULL DEFAULT ''"
            )

        if "batch_id" not in columns:
            connection.execute(
                "ALTER TABLE assessments "
                "ADD COLUMN batch_id TEXT NOT NULL DEFAULT ''"
            )


def _is_question_file(field_name: str, filename: str) -> bool:
    field = field_name.lower()
    name = filename.lower()
    if any(hint in field for hint in QUESTION_HINTS):
        return True
    if any(hint in field for hint in STUDENT_HINTS):
        return False
    return any(hint in name for hint in QUESTION_HINTS)


def _join_text(base: str, additions: list[str]) -> str:
    return "\n\n".join(item for item in [base.strip(), *map(str.strip, additions)] if item)


def _report_totals(report: AssessmentReport) -> tuple[float, float]:
    return (
        sum(item.score for item in report.evaluations),
        sum(item.max_score for item in report.evaluations),
    )


def _reshape_report(report: AssessmentReport, assessment_id: Optional[str] = None) -> dict:
    report_data = report.model_dump()
    response = {
        "result": report_data["evaluations"],
        "overall_summary": report_data["overall_summary"],
        **report_data,
    }
    if assessment_id:
        response["assessment_id"] = assessment_id
    return response


MAX_ASSESSMENTS_PER_SESSION = 5


def save_assessment(
    report: AssessmentReport,
    context: dict,
    question_paper_filename: str,
    student_filename: str,
    session_id: str = "",
    batch_id: str = "",
) -> str:
    assessment_id = str(uuid.uuid4())
    score, max_score = _report_totals(report)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO assessments (
                assessment_id,
                session_id,
                batch_id,
                created_at,
                question_paper_filename,
                student_filename,
                score,
                max_score,
                report_json,
                context_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assessment_id,
                session_id,
                batch_id,
                datetime.now(timezone.utc).isoformat(),
                question_paper_filename,
                student_filename,
                score,
                max_score,
                report.model_dump_json(),
                json.dumps(context, default=str),
            ),
        )

        # Keep only the most recent assessments for this login/session so the
        # database doesn't grow unbounded per user. A batch grades several
        # students in one action, sharing one batch_id — group by that so
        # pruning treats the whole batch as a single retained unit instead of
        # letting later students in the same batch evict earlier ones.
        connection.execute(
            """
            DELETE FROM assessments
            WHERE session_id = ?
              AND COALESCE(NULLIF(batch_id, ''), assessment_id) NOT IN (
                  SELECT grp FROM (
                      SELECT
                          COALESCE(NULLIF(batch_id, ''), assessment_id) AS grp,
                          MAX(created_at) AS latest
                      FROM assessments
                      WHERE session_id = ?
                      GROUP BY grp
                      ORDER BY latest DESC
                      LIMIT ?
                  )
              )
            """,
            (session_id, session_id, MAX_ASSESSMENTS_PER_SESSION),
        )
    return assessment_id

def get_session_id(request: Request) -> str:
    session_id = (
        request.headers.get("X-Session-ID")
        or ""
    ).strip()

    if not session_id:
        raise HTTPException(
            status_code=400,
            detail="X-Session-ID header is required.",
        )

    return session_id


@app.get("/api/auth/config")
def get_auth_config() -> dict:
    return {
        "google_client_id": GOOGLE_CLIENT_ID,
        "allowed_domains": sorted(GOOGLE_ALLOWED_DOMAINS),
    }


@app.post("/api/auth/google")
def authenticate_google(payload: GoogleAuthRequest) -> dict:
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID environment variable is missing.",
        )

    try:
        claims = id_token.verify_oauth2_token(
            payload.credential,
            google_auth_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid Google sign-in token: {exc}",
        ) from exc

    email = str(claims.get("email", "")).lower()
    domain = email.split("@")[-1] if "@" in email else ""

    if GOOGLE_ALLOWED_DOMAINS and domain not in GOOGLE_ALLOWED_DOMAINS:
        raise HTTPException(
            status_code=403,
            detail="This Google account is not allowed to access AutoAssessment.",
        )

    return {
        "user": {
            "email": email,
            "name": claims.get("name") or email,
            "picture": claims.get("picture") or "",
        }
    }

def _prepare_batch_shared_context(payload: dict) -> dict:
    """
    Process question paper/rubric/model answer exactly once for a batch.
    """
    assessment_system = get_assessment_system()
    final_qp = payload["question_paper_text"].strip()
    final_rubric = payload["rubric_text"].strip()

    # ---------------------------------------------------------
    # Question paper / rubric transcription
    # ---------------------------------------------------------
    if payload.get("qp_pdf_bytes"):
        transcription = assessment_system.transcriber.run_pdf(
            payload["qp_pdf_bytes"],
            payload.get("qp_pdf_filename", "question_paper.pdf"),
        )
        final_qp = _join_text(final_qp, [transcription])

    elif payload.get("qp_images"):
        transcription = assessment_system.transcriber.run_images(
            payload["qp_images"],
            "question-paper images",
        )
        final_qp = _join_text(final_qp, [transcription])

    if not final_qp:
        raise ValueError("No readable question paper was provided.")

    # ---------------------------------------------------------
    # Custom grading instructions
    # ---------------------------------------------------------
    custom_instructions = payload.get("custom_instructions", "").strip()

    if custom_instructions:
        final_rubric = (
            f"{final_rubric}\n\n"
            f"ADDITIONAL STAFF INSTRUCTIONS:\n"
            f"{custom_instructions}"
        ).strip()

    # ---------------------------------------------------------
    # Official model answer
    # ---------------------------------------------------------
    answer_key_parts = []

    if payload.get("model_answer_text"):
        answer_key_parts.append(
            payload["model_answer_text"].strip()
        )

    if payload.get("model_answer_pdf_bytes"):
        transcription = assessment_system.transcriber.run_pdf(
            payload["model_answer_pdf_bytes"],
            payload.get(
                "model_answer_pdf_filename",
                "model_answer.pdf",
            ),
        )
        answer_key_parts.append(transcription)

    elif payload.get("model_answer_images"):
        transcription = assessment_system.transcriber.run_images(
            payload["model_answer_images"],
            "official-model-answer images",
        )
        answer_key_parts.append(transcription)

    answer_key = "\n\n".join(
        part.strip()
        for part in answer_key_parts
        if part and part.strip()
    )

    # Generate only ONCE for entire batch
    if not answer_key:
        print("[Batch] Generating shared master answer key")
        answer_key = assessment_system.solver.run(
            final_qp,
            final_rubric,
        )
    else:
        print("[Batch] Using supplied master answer key")

    return {
        "question_paper": final_qp,
        "rubric": final_rubric,
        "answer_key": answer_key,
    }


def _parse_batch_student_file(upload) -> dict:
    """
    Parse exactly one student's uploaded answer sheet.
    """
    upload.file.seek(0)
    file_bytes = upload.file.read()

    if not file_bytes:
        raise ValueError(
            f"{upload.filename!r} is empty."
        )

    parsed = extract_content_from_file(
        upload.filename,
        file_bytes,
    )

    if parsed.error:
        raise ValueError(
            f"Could not process {upload.filename!r}: "
            f"{parsed.error}"
        )

    return {
        "student_answer_text": parsed.text or "",
        "student_images": list(parsed.images or []),
        "student_pdf_bytes": parsed.pdf_bytes,
        "student_pdf_filename": parsed.filename,
        "student_filename": parsed.filename,
    }


def _evaluate_batch_student(
    shared: dict,
    student_payload: dict,
) -> tuple[AssessmentReport, dict]:
    """
    Grade one student against already prepared shared material.

    A local agent instance is deliberately used so concurrent students
    do not share last_context/conversation_history.
    """
    worker = RubricAssessmentAgent()

    student_work = (
        student_payload.get("student_answer_text")
        or ""
    ).strip()

    if student_payload.get("student_pdf_bytes"):
        transcription = worker.transcriber.run_pdf(
            student_payload["student_pdf_bytes"],
            student_payload.get(
                "student_pdf_filename",
                "student_submission.pdf",
            ),
        )
        student_work = _join_text(
            student_work,
            [transcription],
        )

    elif student_payload.get("student_images"):
        transcription = worker.transcriber.run_images(
            student_payload["student_images"],
            "student-submission images",
        )
        student_work = _join_text(
            student_work,
            [transcription],
        )

    if not student_work:
        raise ValueError(
            "No readable student work was extracted."
        )

    if needs_visual_grading(shared["question_paper"], shared["rubric"]):
        report = worker.evaluator.run(
            shared["question_paper"],
            shared["rubric"],
            shared["answer_key"],
            student_work,
            student_images=student_payload.get("student_images") or None,
            student_pdf_bytes=student_payload.get("student_pdf_bytes") or None,
        )
    else:
        report = worker.evaluator.run(
            shared["question_paper"],
            shared["rubric"],
            shared["answer_key"],
            student_work,
        )

    report = worker.auditor.run(report)

    context = {
        "question_paper": shared["question_paper"],
        "rubric": shared["rubric"],
        "answer_key": shared["answer_key"],
        "student_work": student_work,
        "report": report,
    }

    return report, context


def load_assessment(assessment_id: str) -> AssessmentReport:
    assessment_system = get_assessment_system()
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT report_json, context_json FROM assessments WHERE assessment_id = ?",
            (assessment_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    report = AssessmentReport.model_validate_json(row[0])
    context = json.loads(row[1])
    context["report"] = report
    assessment_system.last_context = context
    assessment_system.conversation_history = []
    return report


def persist_current_report(assessment_id: str) -> None:
    assessment_system = get_assessment_system()
    if not assessment_system.last_context:
        raise RuntimeError("No assessment context is loaded.")
    report: AssessmentReport = assessment_system.last_context["report"]
    score, max_score = _report_totals(report)
    stored_context = dict(assessment_system.last_context)
    stored_context["report"] = report.model_dump()
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            UPDATE assessments
            SET score = ?, max_score = ?, report_json = ?, context_json = ?
            WHERE assessment_id = ?
            """,
            (score, max_score, report.model_dump_json(), json.dumps(stored_context), assessment_id),
        )


def _parse_uploads(form) -> dict:
    qp_text = str(
        form.get("question_paper_text")
        or form.get("question_paper")
        or ""
    )

    rubric_text = str(
        form.get("rubric_text")
        or form.get("rubric")
        or ""
    )

    student_text = str(
        form.get("student_answer_text")
        or form.get("student_text")
        or ""
    )

    model_answer_text = str(
        form.get("model_answer_text")
        or form.get("model_answer")
        or ""
    )

    custom_instructions = str(
        form.get("custom_instructions")
        or form.get("instructions")
        or ""
    )

    # ---------------------------------------------------------
    # Question paper / rubric
    # ---------------------------------------------------------
    qp_images: list[Image.Image] = []
    qp_text_parts: list[str] = []
    qp_pdf_bytes: Optional[bytes] = None
    qp_filename = "question_paper"

    # ---------------------------------------------------------
    # Student submission
    # ---------------------------------------------------------
    student_images: list[Image.Image] = []
    student_text_parts: list[str] = []
    student_pdf_bytes: Optional[bytes] = None
    student_filename = "student_submission"

    # ---------------------------------------------------------
    # Official model answer
    # ---------------------------------------------------------
    model_answer_images: list[Image.Image] = []
    model_answer_text_parts: list[str] = []
    model_answer_pdf_bytes: Optional[bytes] = None
    model_answer_filename = "model_answer"

    for field_name in form.keys():
        for value in form.getlist(field_name):

            # Ignore normal text fields.
            if not (
                hasattr(value, "filename")
                and value.filename
            ):
                continue

            file_bytes = value.file.read()

            if not file_bytes:
                raise HTTPException(
                    status_code=422,
                    detail=f"{value.filename!r} is empty.",
                )

            parsed = extract_content_from_file(
                value.filename,
                file_bytes,
            )

            if parsed.error:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Could not process "
                        f"{value.filename!r}: {parsed.error}"
                    ),
                )

            # =================================================
            # MODEL ANSWER
            # =================================================
            # Important: handle this BEFORE generic
            # "answer" classification.
            if field_name == "model_answer_file":

                model_answer_filename = parsed.filename

                if parsed.text:
                    model_answer_text_parts.append(
                        parsed.text
                    )

                if parsed.images:
                    model_answer_images.extend(
                        parsed.images
                    )

                if parsed.pdf_bytes:
                    if model_answer_pdf_bytes is not None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Use only one model-answer "
                                "PDF per request."
                            ),
                        )

                    model_answer_pdf_bytes = (
                        parsed.pdf_bytes
                    )

                continue

            # =================================================
            # QUESTION PAPER / RUBRIC
            # =================================================
            if field_name in {
                "question_paper_file",
                "rubric_file",
            }:

                qp_filename = parsed.filename

                if parsed.text:
                    qp_text_parts.append(parsed.text)

                if parsed.images:
                    qp_images.extend(parsed.images)

                if parsed.pdf_bytes:
                    if qp_pdf_bytes is not None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Use one question-paper/"
                                "rubric PDF per request."
                            ),
                        )

                    qp_pdf_bytes = parsed.pdf_bytes

                continue

            # =================================================
            # STUDENT ANSWER
            # =================================================
            if field_name in {
                "answer_file",
                "student_answer_file",
            }:

                student_filename = parsed.filename

                if parsed.text:
                    student_text_parts.append(
                        parsed.text
                    )

                if parsed.images:
                    student_images.extend(
                        parsed.images
                    )

                if parsed.pdf_bytes:
                    if student_pdf_bytes is not None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Use one student-answer "
                                "PDF per request."
                            ),
                        )

                    student_pdf_bytes = (
                        parsed.pdf_bytes
                    )

                continue

            # =================================================
            # BACKWARD-COMPATIBILITY FALLBACK
            # =================================================
            if _is_question_file(
                field_name,
                value.filename,
            ):
                qp_filename = parsed.filename

                if parsed.text:
                    qp_text_parts.append(parsed.text)

                if parsed.images:
                    qp_images.extend(parsed.images)

                if parsed.pdf_bytes:
                    if qp_pdf_bytes is not None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Use one question-paper "
                                "PDF per request."
                            ),
                        )

                    qp_pdf_bytes = parsed.pdf_bytes

            else:
                student_filename = parsed.filename

                if parsed.text:
                    student_text_parts.append(
                        parsed.text
                    )

                if parsed.images:
                    student_images.extend(
                        parsed.images
                    )

                if parsed.pdf_bytes:
                    if student_pdf_bytes is not None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Use one student-answer "
                                "PDF per request."
                            ),
                        )

                    student_pdf_bytes = (
                        parsed.pdf_bytes
                    )

    return {
        "question_paper_text": _join_text(
            qp_text,
            qp_text_parts,
        ),

        "rubric_text": rubric_text,

        "student_answer_text": _join_text(
            student_text,
            student_text_parts,
        ),

        "model_answer_text": _join_text(
            model_answer_text,
            model_answer_text_parts,
        ),

        "custom_instructions": custom_instructions,

        "qp_images": qp_images,
        "student_images": student_images,
        "model_answer_images": model_answer_images,

        "qp_pdf_bytes": qp_pdf_bytes,
        "student_pdf_bytes": student_pdf_bytes,
        "model_answer_pdf_bytes": model_answer_pdf_bytes,

        "qp_pdf_filename": qp_filename,
        "student_pdf_filename": student_filename,
        "model_answer_pdf_filename": model_answer_filename,

        "question_paper_filename": qp_filename,
        "student_filename": student_filename,
    }

init_db()


@app.get("/api/models")
def get_pipeline_models():
    """Return the exact runtime configuration of the assessment pipeline."""

    return {
        "agents": [
            {
                "agent": "Transcriber",
                "role": "Multimodal Document Transcription",
                "model": TRANSCRIPTION_MODEL,
                "type": "Vision",
                "desc": (
                    "Transcribes handwritten and typed PDFs/images "
                    "into structured Markdown while preserving questions, "
                    "mathematical notation, tables, and page boundaries."
                ),
            },
            {
                "agent": "Solver",
                "role": "Reference Answer Generation",
                "model": GRADING_MODEL,
                "type": "Reasoning",
                "desc": (
                    "Generates a step-by-step reference answer key when "
                    "an official model answer is not provided."
                ),
            },
            {
                "agent": "Evaluator",
                "role": "Evidence-Anchored Rubric Grading",
                "model": GRADING_MODEL,
                "type": "Structured Output",
                "desc": (
                    "Grades each answer against the rubric, assigns "
                    "criterion-level scores, cites student evidence, "
                    "and produces actionable feedback."
                ),
            },
            {
                "agent": "Auditor",
                "role": "Deterministic Score Validation",
                "model": "Python",
                "type": "Deterministic Guardrail",
                "desc": (
                    "Checks score bounds, duplicate question IDs, "
                    "criterion totals, and arithmetic invariants "
                    "without using an LLM."
                ),
            },
            {
                "agent": "Regrade Agent",
                "role": "Evidence-Based Re-evaluation",
                "model": GRADING_MODEL,
                "type": "Verification",
                "desc": (
                    "Re-evaluates specific grading disputes and verifies "
                    "student evidence before allowing score changes."
                ),
            },
            {
                "agent": "Chat Agent",
                "role": "Assessment-Grounded Tutoring",
                "model": CHAT_MODEL,
                "type": "Interactive",
                "desc": (
                    "Answers multi-turn student questions using the rubric, "
                    "reference answer, submission, and graded report as context."
                ),
            },
        ]
    }

@app.post("/api/assess")
@app.post("/evaluate")
async def assess_submission(request: Request):
    try:
        # -----------------------------------------
        # Get browser/session identity FIRST
        # -----------------------------------------
        session_id = get_session_id(request)

        # -----------------------------------------
        # Parse uploaded files
        # -----------------------------------------
        payload = _parse_uploads(
            await request.form()
        )

        if not (
            payload["question_paper_text"]
            or payload["qp_images"]
            or payload["qp_pdf_bytes"]
        ):
            raise HTTPException(
                status_code=422,
                detail="No readable question paper was provided.",
            )

        if not (
            payload["student_answer_text"]
            or payload["student_images"]
            or payload["student_pdf_bytes"]
        ):
            raise HTTPException(
                status_code=422,
                detail="No readable student answer was provided.",
            )
        assessment_system = get_assessment_system()
        report = assessment_system.process_submission(
            **{
                key: value
                for key, value in payload.items()
                if key not in {
                    "question_paper_filename",
                    "student_filename",
                }
            }
        )

        context = assessment_system.last_context

        assessment_id = save_assessment(
            report,
            context,
            payload["question_paper_filename"],
            payload["student_filename"],
            session_id=session_id,
        )

        return _reshape_report(
            report,
            assessment_id,
        )

        # -----------------------------------------
        # Save WITH session_id
        # -----------------------------------------
        context = assessment_system.last_context

        assessment_id = save_assessment(
            report,
            context,
            payload["question_paper_filename"],
            payload["student_filename"],
            session_id=session_id,
        )

        return _reshape_report(
            report,
            assessment_id,
        )

    except HTTPException:
        raise

    except ValueError as error:
        logger.exception(
            "Assessment validation error"
        )

        raise HTTPException(
            status_code=422,
            detail=str(error),
        )

    except Exception:
        logger.exception(
            "Unexpected assessment error"
        )

        raise HTTPException(
            status_code=500,
            detail="Assessment processing failed. Check server logs.",
        )


@app.get("/api/assessments/recent")
async def recent_assessments(request: Request, limit: int = 20,):
    session_id = get_session_id(request)

    limit = max(1, min(limit, 100))

    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row

        rows = connection.execute(
            """
            SELECT
                assessment_id,
                created_at,
                question_paper_filename,
                student_filename,
                score,
                max_score
            FROM assessments
            WHERE session_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (
                session_id,
                limit,
            ),
        ).fetchall()

    return {"assessments": [dict(row)for row in rows]}


@app.get("/api/assessments/{assessment_id}")
async def get_assessment(assessment_id: str):
    report = load_assessment(assessment_id)
    return _reshape_report(report, assessment_id)


@app.delete("/api/assessments/{assessment_id}")
async def delete_assessment(assessment_id: str, request: Request):
    session_id = get_session_id(request)
    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.execute(
            "DELETE FROM assessments WHERE assessment_id = ? AND session_id = ?",
            (assessment_id, session_id),
        )
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    return {"deleted": assessment_id}


@app.post("/api/regrade")
async def regrade_question(request: Request):
    try:
        body = await request.json()
        assessment_id = str(body.get("assessment_id") or "").strip()
        question_id = str(body.get("question_id") or "").strip()
        claimed_mistake = str(body.get("claimed_mistake") or body.get("reason") or "").strip()
        if not assessment_id:
            raise HTTPException(status_code=400, detail="assessment_id is required.")
        if not question_id:
            raise HTTPException(status_code=400, detail="question_id is required.")
        if len(claimed_mistake) < 8:
            raise HTTPException(status_code=400, detail="Describe a specific grading mistake (at least 8 characters).")

        load_assessment(assessment_id)
        assessment_system = get_assessment_system()
        dispute = RegradeRequest(
            disputed_criterion=str(body.get("disputed_criterion") or "").strip() or None,
            claimed_mistake=claimed_mistake,
            evidence_quote=str(body.get("evidence_quote") or "").strip() or None,
        )
        result = assessment_system.regrade_question(question_id, dispute)
        persist_current_report(assessment_id)
        return {
            "question": result.question.model_dump(),
            "changed": result.changed,
            "claim_verified": result.claim_verified,
            "explanation": result.explanation,
            "report": _reshape_report(assessment_system.last_context["report"], assessment_id),
        }
    except HTTPException:
        raise
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))


@app.post("/api/chat")
@app.post("/chat")
async def chat_with_agent(request: Request):
    try:
        body = await request.json()
        assessment_id = str(body.get("assessment_id") or "").strip()
        if not assessment_id:
            raise HTTPException(status_code=400, detail="assessment_id is required.")
        load_assessment(assessment_id)
        assessment_system = get_assessment_system()
        message = str(body.get("message") or body.get("user_message") or body.get("prompt") or "").strip()
        if not message and isinstance(body.get("messages"), list):
            for item in reversed(body["messages"]):
                if isinstance(item, dict) and item.get("role") == "user":
                    message = str(item.get("content") or "").strip()
                    break
        if not message:
            raise HTTPException(status_code=400, detail="No chat message was provided.")
        reply = assessment_system.verify_and_chat(message)
        return {"answer": reply, "response": reply, "reply": reply}
    except HTTPException:
        raise
    except Exception as error:
        print(f"[Chat] Error: {error}")
        raise HTTPException(status_code=500, detail="Chat processing failed. Check server logs.")

@app.post("/api/chat/stream")
async def chat_stream_with_agent(request: ChatRequest):
    if not request.assessment_id:
        raise HTTPException(
            status_code=400,
            detail="assessment_id is required."
        )

    if not request.messages:
        raise HTTPException(
            status_code=400,
            detail="At least one chat message is required."
        )

    try:

        load_assessment(request.assessment_id)
        assessment_system = get_assessment_system()
        context = assessment_system._chat_context()

        conversation = "\n".join(
            f"{message.role.upper()}: {message.content}"
            for message in request.messages[-10:]
        )

        prompt = (
            context
            + "\n\n=== CHAT TRANSCRIPT ===\n"
            + conversation
            + "\nASSISTANT:"
        )

        client = assessment_system.client
        chat_model = os.getenv(
            "GEMINI_CHAT_MODEL",
            "gemini-3.5-flash-lite"
        )

        def token_generator():
            try:
                chat = client.chats.create(model=CHAT_MODEL)

                stream = chat.send_message_stream(prompt)

                for chunk in stream:
                    text = getattr(chunk, "text", None)

                    if text:
                        yield text

            except Exception:
                logger.exception("Agent chat streaming failed")

                # Don't expose internal exception details to user
                yield "\n\nSorry, the response stream was interrupted."

        return StreamingResponse(
            token_generator(),
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise

    except Exception as error:
        logger.exception("Failed to initialize chat stream")

        raise HTTPException(
            status_code=500,
            detail="Could not start agent chat."
        )

@app.post("/api/assess/batch")
async def assess_batch(request: Request):
    try:
        session_id = get_session_id(request)
        batch_id = str(uuid.uuid4())

        form = await request.form()

        answer_files = list(
            form.getlist("answer_files")
        )

        if not answer_files:
            raise HTTPException(
                status_code=422,
                detail="No student answer sheets were provided.",
            )

        # Optional safety limit.
        max_batch_size = int(
            os.getenv("MAX_BATCH_SIZE", "25")
        )

        if len(answer_files) > max_batch_size:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Batch contains {len(answer_files)} students; "
                    f"maximum allowed is {max_batch_size}."
                ),
            )

        # -----------------------------------------------------
        # Parse common material WITHOUT answer_files.
        # This lets us reuse your existing upload parser.
        # -----------------------------------------------------
        common_form = FormData([
            (key, value)
            for key, value in form.multi_items()
            if key not in {
                "answer_files",
                "student_ids",
            }
        ])

        shared_payload = _parse_uploads(
            common_form
        )

        if not (
            shared_payload["question_paper_text"]
            or shared_payload["qp_images"]
            or shared_payload["qp_pdf_bytes"]
        ):
            raise HTTPException(
                status_code=422,
                detail="No readable question paper was provided.",
            )

        print(
            f"[Batch] Preparing common material for "
            f"{len(answer_files)} student(s)"
        )

        # Gemini calls are synchronous, therefore move them
        # away from FastAPI's event loop.
        shared = await asyncio.to_thread(
            _prepare_batch_shared_context,
            shared_payload,
        )

        # -----------------------------------------------------
        # Student IDs
        # -----------------------------------------------------
        requested_ids = [
            str(value).strip()
            for value in form.getlist("student_ids")
        ]

        students = []
        seen_ids = set()

        for index, upload in enumerate(answer_files):
            payload = _parse_batch_student_file(
                upload
            )

            student_id = (
                requested_ids[index]
                if index < len(requested_ids)
                and requested_ids[index]
                else upload.filename
            )

            # Avoid dictionary collisions if filenames repeat.
            original_id = student_id
            suffix = 2

            while student_id in seen_ids:
                student_id = (
                    f"{original_id} ({suffix})"
                )
                suffix += 1

            seen_ids.add(student_id)

            students.append(
                (
                    student_id,
                    upload.filename,
                    payload,
                )
            )

        # -----------------------------------------------------
        # Bounded concurrent grading
        # -----------------------------------------------------
        semaphore = asyncio.Semaphore(
            BATCH_CONCURRENCY
        )

        async def grade_one(
            student_id: str,
            filename: str,
            payload: dict,
        ):
            async with semaphore:
                try:
                    print(
                        f"[Batch] Starting {student_id}"
                    )

                    report, context = (
                        await asyncio.to_thread(
                            _evaluate_batch_student,
                            shared,
                            payload,
                        )
                    )

                    print(
                        f"[Batch] Completed {student_id}"
                    )

                    return {
                        "student_id": student_id,
                        "filename": filename,
                        "report": report,
                        "context": context,
                        "error": None,
                    }

                except Exception as error:
                    logger.exception(
                        "Batch assessment failed for %s",
                        student_id,
                    )

                    return {
                        "student_id": student_id,
                        "filename": filename,
                        "report": None,
                        "context": None,
                        "error": str(error),
                    }

        tasks = [
            grade_one(
                student_id,
                filename,
                payload,
            )
            for student_id, filename, payload
            in students
        ]

        completed = await asyncio.gather(
            *tasks
        )

        # -----------------------------------------------------
        # Persist sequentially.
        #
        # Do NOT write SQLite concurrently. Gemini grading can
        # run concurrently, but DB writes remain short/serial.
        # -----------------------------------------------------
        results = {}
        errors = {}

        for item in completed:
            student_id = item["student_id"]

            if item["error"]:
                errors[student_id] = item["error"]
                continue

            report = item["report"]
            context = item["context"]

            assessment_id = save_assessment(
                report,
                context,
                shared_payload[
                    "question_paper_filename"
                ],
                item["filename"],
                session_id=session_id,
                batch_id=batch_id,
            )

            results[student_id] = (
                _reshape_report(
                    report,
                    assessment_id,
                )
            )

        if not results:
            raise HTTPException(
                status_code=422,
                detail={
                    "message": (
                        "Every student assessment failed."
                    ),
                    "errors": errors,
                },
            )

        batch_id = str(uuid.uuid4())

        print(
            f"[Batch] Finished {batch_id}: "
            f"{len(results)} succeeded, "
            f"{len(errors)} failed"
        )

        return {
            "batch_id": batch_id,
            "results": results,
            "errors": errors,
            "total": len(answer_files),
            "completed": len(results),
            "failed": len(errors),
        }

    except HTTPException:
        raise

    except ValueError as error:
        logger.exception(
            "Batch validation failed"
        )

        raise HTTPException(
            status_code=422,
            detail=str(error),
        )

    except Exception:
        logger.exception(
            "Unexpected batch assessment failure"
        )

        raise HTTPException(
            status_code=500,
            detail="Batch assessment failed. Check server logs.",
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web:app", host="0.0.0.0", port=8000, reload=True)
class TTSRequest(BaseModel):
    text: str
    lang: str = "en"
    voice: str = "Kavya"

def _clean_for_speech(text: str) -> str:
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"\$\$([\s\S]*?)\$\$", r" \1 ", text)
    text = re.sub(r"\$([^$]*?)\$", r" \1 ", text)
    text = re.sub(r"\\[a-zA-Z]+\{([^{}]*)\}", r"\1", text)  # \text{cm} -> cm
    text = re.sub(r"\\[a-zA-Z]+", "", text)  # remaining LaTeX commands, e.g. \cdot
    text = text.replace("{", "").replace("}", "").replace("\\", "")
    text = re.sub(r"[*#_`\[\]()]", "", text)
    return re.sub(r"\s+", " ", text).strip()

# Measured against the live API: this model generates audio at close to real-time
# speed (bytes/sec ~= the resulting clip's own playback rate), so wait time tracks
# the *spoken* length of the input, not just its character count. An unbounded
# input can take a minute or more. Cap it, cutting at the last full sentence
# rather than mid-word, to keep the wait to roughly 10-15 seconds.
SPEECH_CHAR_LIMIT = 300

def _trim_for_speech(text: str, limit: int = SPEECH_CHAR_LIMIT) -> str:
    if len(text) <= limit:
        return text
    window = text[:limit]
    cutoff = max(window.rfind(". "), window.rfind("! "), window.rfind("? "))
    return window[: cutoff + 1] if cutoff > limit // 2 else window.rsplit(" ", 1)[0] + "."

@app.post("/api/voice/synthesize")
async def synthesize_voice(request: TTSRequest):
    """
    Synthesizes natural speech audio using the Bodhan "indic-speak" TTS model.
    Returns a playable audio stream directly to the frontend.
    """
    clean_text = _trim_for_speech(_clean_for_speech(request.text))
    if not clean_text:
        raise HTTPException(status_code=400, detail="Empty text provided")

    client = get_tts_client()
    try:
        speech = await asyncio.to_thread(
            client.audio.speech.create,
            model="indic-speak",
            input=clean_text,
            voice=request.voice,
            instructions=json.dumps({"lang": request.lang}),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=502, detail="Voice synthesis failed")

    return StreamingResponse(io.BytesIO(speech.content), media_type="audio/wav")
