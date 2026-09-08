import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auto_assessment.web")
import base64
import hashlib
import hmac
import io
import json
import re
import os
import secrets
import shutil
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import Response, WebSocket, WebSocketDisconnect
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
    BODHAN_OCR_ENABLED,
    BODHAN_OCR_MODEL,
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

_db_path_override = os.getenv("DB_PATH", "").strip()
DB_PATH = Path(_db_path_override) if _db_path_override else Path(__file__).with_name("assessment_history.db")
BODHAN_API_KEY = os.getenv("BODHAN_API_KEY", "").strip()
BODHAN_TTS_BASE_URL = os.getenv("BODHAN_TTS_BASE_URL", "https://api.bodhan.ai/v1").strip()
TTS_MODEL = os.getenv("TTS_MODEL", "indic-speak").strip()
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
GOOGLE_ALLOWED_DOMAINS = {
    domain.strip().lower()
    for domain in os.getenv("GOOGLE_ALLOWED_DOMAINS", "").split(",")
    if domain.strip()
}

SESSION_SECRET = os.getenv("SESSION_SECRET", "").strip()
if not SESSION_SECRET:
    SESSION_SECRET = secrets.token_hex(32)
    logger.warning(
        "SESSION_SECRET is not set; generated a temporary one for this process. "
        "Signed-in users will be signed out on every restart. Set SESSION_SECRET "
        "in .env to persist sessions across restarts."
    )
SESSION_TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days
SESSION_COOKIE_NAME = "autoassessment_session"


def issue_session_token(email: str) -> str:
    payload = json.dumps({"email": email, "iat": int(datetime.now(timezone.utc).timestamp())}).encode()
    payload_b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    sig = hmac.new(SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def get_user_email(request: Request) -> str:
    """
    Recovers the signed-in user's email from a token this server issued at
    login. Unlike a client-supplied header, this can't be forged: the token
    is HMAC-signed with a server-side secret the client never sees.
    """
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.lower().startswith("bearer ") else ""
    if not token:
        token = request.cookies.get(SESSION_COOKIE_NAME, "")
    if not token or "." not in token:
        raise HTTPException(status_code=401, detail="Sign-in required.")
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected_sig = hmac.new(SESSION_SECRET.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected_sig):
            raise ValueError("bad signature")
        padded = payload_b64 + "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded))
        email = str(payload.get("email", "")).strip().lower()
        issued_at = int(payload.get("iat", 0))
        if not email:
            raise ValueError("missing email")
        if datetime.now(timezone.utc).timestamp() - issued_at > SESSION_TOKEN_MAX_AGE_SECONDS:
            raise ValueError("expired")
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    return email
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
        _tts_client = OpenAI(base_url=BODHAN_TTS_BASE_URL, api_key=BODHAN_API_KEY)
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

        if "user_email" not in columns:
            connection.execute(
                "ALTER TABLE assessments "
                "ADD COLUMN user_email TEXT NOT NULL DEFAULT ''"
            )

        # Agentic memory: recurring weak concepts per student, and grading
        # corrections confirmed on a given question paper (so future students
        # on the same test benefit from a mistake already caught once).
        connection.execute("""
            CREATE TABLE IF NOT EXISTS student_memory (
                user_email TEXT NOT NULL,
                student_key TEXT NOT NULL DEFAULT '',
                concept TEXT NOT NULL,
                weak_count INTEGER NOT NULL DEFAULT 0,
                last_seen TEXT NOT NULL,
                last_note TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (user_email, student_key, concept)
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS grading_corrections (
                id TEXT PRIMARY KEY,
                question_paper_hash TEXT NOT NULL,
                disputed_criterion TEXT NOT NULL DEFAULT '',
                claimed_mistake TEXT NOT NULL,
                evidence_quote TEXT NOT NULL DEFAULT '',
                explanation TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            )
        """)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_grading_corrections_hash "
            "ON grading_corrections(question_paper_hash)"
        )


# =====================================================================
# AGENTIC MEMORY
#
# Two independent memory stores, both consumed by EvaluatorAgent.run()
# as extra prompt context:
#   - student_memory: per-student recurring weak concepts, updated after
#     every graded assessment (strengthens on repeat misses, fades on
#     mastery).
#   - grading_corrections: confirmed regrade outcomes for a given question
#     paper, so a mistake caught once isn't repeated on the next student.
# =====================================================================

def _question_paper_hash(question_paper: str) -> str:
    normalized = re.sub(r"\s+", " ", question_paper.strip().lower())
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def _canonicalize_concept(connection, user_email: str, student_key: str, concept: str) -> str:
    """
    The grading model names concepts freely in its own words, so the same
    underlying weakness can come back phrased differently each time (e.g.
    "Quadratic Factoring" vs "Quadratic Factoring via Middle-Term Splitting").
    Fold a new concept into an existing near-duplicate for this student
    rather than fragmenting weak_count across near-identical rows.
    """
    new_lower = concept.lower()
    for (existing,) in connection.execute(
        "SELECT concept FROM student_memory WHERE user_email = ? AND student_key = ?",
        (user_email, student_key),
    ).fetchall():
        existing_lower = existing.lower()
        if existing_lower in new_lower or new_lower in existing_lower:
            return existing
    return concept


def update_student_memory(user_email: str, report: AssessmentReport, student_key: str = "") -> None:
    if not user_email:
        return
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(DB_PATH) as connection:
        for item in report.evaluations:
            concept = (item.concept_tested or "").strip()
            if not concept or item.max_score <= 0:
                continue
            concept = _canonicalize_concept(connection, user_email, student_key, concept)
            if item.score < item.max_score:
                note = (item.actionable_takeaway or item.feedback or "")[:300]
                connection.execute(
                    """
                    INSERT INTO student_memory (user_email, student_key, concept, weak_count, last_seen, last_note)
                    VALUES (?, ?, ?, 1, ?, ?)
                    ON CONFLICT(user_email, student_key, concept) DO UPDATE SET
                        weak_count = weak_count + 1,
                        last_seen = excluded.last_seen,
                        last_note = excluded.last_note
                    """,
                    (user_email, student_key, concept, now, note),
                )
            else:
                # Full marks this time — let the concept fade rather than
                # keep flagging something the student has since mastered.
                connection.execute(
                    """
                    UPDATE student_memory SET weak_count = MAX(weak_count - 1, 0), last_seen = ?
                    WHERE user_email = ? AND student_key = ? AND concept = ?
                    """,
                    (now, user_email, student_key, concept),
                )
        connection.execute(
            "DELETE FROM student_memory WHERE user_email = ? AND student_key = ? AND weak_count <= 0",
            (user_email, student_key),
        )


def get_student_memory(user_email: str, student_key: str = "", limit: int = 5) -> list[dict]:
    if not user_email:
        return []
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT concept, weak_count, last_seen, last_note FROM student_memory
            WHERE user_email = ? AND student_key = ? AND weak_count > 0
            ORDER BY weak_count DESC, last_seen DESC
            LIMIT ?
            """,
            (user_email, student_key, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def format_weak_areas_for_prompt(entries: list[dict]) -> str:
    if not entries:
        return ""
    return "\n".join(
        f"- {e['concept']} (seen weak {e['weak_count']}x, most recently: {e['last_note'] or 'no note'})"
        for e in entries
    )


def record_grading_correction(
    question_paper: str,
    disputed_criterion: str,
    claimed_mistake: str,
    evidence_quote: str,
    explanation: str,
) -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO grading_corrections (
                id, question_paper_hash, disputed_criterion, claimed_mistake,
                evidence_quote, explanation, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                _question_paper_hash(question_paper),
                disputed_criterion or "",
                claimed_mistake,
                evidence_quote or "",
                explanation or "",
                datetime.now(timezone.utc).isoformat(),
            ),
        )


def get_grading_corrections(question_paper: str, limit: int = 5) -> list[dict]:
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT disputed_criterion, claimed_mistake, evidence_quote, explanation
            FROM grading_corrections
            WHERE question_paper_hash = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (_question_paper_hash(question_paper), limit),
        ).fetchall()
    return [dict(row) for row in rows]


def format_corrections_for_prompt(entries: list[dict]) -> str:
    if not entries:
        return ""
    lines = []
    for e in entries:
        where = f" ({e['disputed_criterion']})" if e["disputed_criterion"] else ""
        lines.append(f"- Criterion{where}: {e['claimed_mistake']} — confirmed: {e['explanation']}")
    return "\n".join(lines)


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
    user_email: str = "",
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
                user_email,
                created_at,
                question_paper_filename,
                student_filename,
                score,
                max_score,
                report_json,
                context_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assessment_id,
                session_id,
                batch_id,
                user_email,
                datetime.now(timezone.utc).isoformat(),
                question_paper_filename,
                student_filename,
                score,
                max_score,
                report.model_dump_json(),
                json.dumps(context, default=str),
            ),
        )

        # Keep only the most recent assessments for this signed-in user so the
        # database doesn't grow unbounded. A batch grades several students in
        # one action, sharing one batch_id — group by that so pruning treats
        # the whole batch as a single retained unit instead of letting later
        # students in the same batch evict earlier ones.
        connection.execute(
            """
            DELETE FROM assessments
            WHERE user_email = ?
              AND COALESCE(NULLIF(batch_id, ''), assessment_id) NOT IN (
                  SELECT grp FROM (
                      SELECT
                          COALESCE(NULLIF(batch_id, ''), assessment_id) AS grp,
                          MAX(created_at) AS latest
                      FROM assessments
                      WHERE user_email = ?
                      GROUP BY grp
                      ORDER BY latest DESC
                      LIMIT ?
                  )
              )
            """,
            (user_email, user_email, MAX_ASSESSMENTS_PER_SESSION),
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
def authenticate_google(payload: GoogleAuthRequest, response: Response) -> dict:
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

    session_token = issue_session_token(email)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        session_token,
        max_age=SESSION_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=os.getenv("AUTH_COOKIE_SECURE", "").lower() == "true",
        samesite="lax",
        path="/",
    )

    return {
        "user": {
            "email": email,
            "name": claims.get("name") or email,
            "picture": claims.get("picture") or "",
        },
        "token": session_token,
    }


@app.post("/api/auth/signout")
def sign_out(response: Response) -> dict:
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"signed_out": True}

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

    # Reference diagrams don't depend on any one student's work, so generate
    # them once here too, rather than once per student.
    reference_diagrams: dict[str, str] = {}
    if needs_visual_grading(final_qp, final_rubric):
        print("[Batch] Generating shared reference diagrams")
        reference_diagrams = assessment_system.evaluator.generate_reference_diagrams(
            final_qp, final_rubric
        )

    return {
        "question_paper": final_qp,
        "rubric": final_rubric,
        "answer_key": answer_key,
        "reference_diagrams": reference_diagrams,
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
    user_email: str = "",
    student_key: str = "",
) -> tuple[AssessmentReport, dict]:
    """
    Grade one student against already prepared shared material.

    A local agent instance is deliberately used so concurrent students
    do not share last_context/conversation_history.
    """
    worker = RubricAssessmentAgent()
    prior_weak_areas = format_weak_areas_for_prompt(get_student_memory(user_email, student_key))

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

    known_corrections = format_corrections_for_prompt(get_grading_corrections(shared["question_paper"]))

    if needs_visual_grading(shared["question_paper"], shared["rubric"]):
        report = worker.evaluator.run(
            shared["question_paper"],
            shared["rubric"],
            shared["answer_key"],
            student_work,
            student_images=student_payload.get("student_images") or None,
            student_pdf_bytes=student_payload.get("student_pdf_bytes") or None,
            prior_weak_areas=prior_weak_areas,
            known_corrections=known_corrections,
        )
    else:
        report = worker.evaluator.run(
            shared["question_paper"],
            shared["rubric"],
            shared["answer_key"],
            student_work,
            prior_weak_areas=prior_weak_areas,
            known_corrections=known_corrections,
        )

    report = worker.auditor.run(report)

    reference_diagrams = shared.get("reference_diagrams") or {}
    for item in report.evaluations:
        if item.question_id in reference_diagrams:
            item.reference_diagram_svg = reference_diagrams[item.question_id]

    context = {
        "question_paper": shared["question_paper"],
        "rubric": shared["rubric"],
        "answer_key": shared["answer_key"],
        "student_work": student_work,
        "report": report,
    }

    return report, context


def load_assessment(assessment_id: str, user_email: str = "") -> tuple[AssessmentReport, dict]:
    """
    Loads an assessment fresh from the DB into a local dict, rather than
    onto shared instance state — get_assessment_system() returns one
    process-wide instance, so stashing "the current assessment" on it would
    let concurrent requests from different users clobber each other's
    context (see the comment on _evaluate_batch_student for the batch-mode
    equivalent of this same rule).
    """
    with sqlite3.connect(DB_PATH) as connection:
        if user_email:
            row = connection.execute(
                "SELECT report_json, context_json FROM assessments WHERE assessment_id = ? AND user_email = ?",
                (assessment_id, user_email),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT report_json, context_json FROM assessments WHERE assessment_id = ?",
                (assessment_id,),
            ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")

    report = AssessmentReport.model_validate_json(row[0])
    context = json.loads(row[1])
    context["report"] = report
    return report, context


def persist_current_report(assessment_id: str, report: AssessmentReport, context: dict) -> None:
    score, max_score = _report_totals(report)
    stored_context = dict(context)
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
    ocr_preview_raw = str(form.get("ocr_preview_json") or "").strip()
    try:
        ocr_preview = json.loads(ocr_preview_raw) if ocr_preview_raw else {}
    except json.JSONDecodeError as error:
        raise HTTPException(status_code=422, detail="Invalid OCR preview JSON.") from error

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
        "ocr_preview": ocr_preview,
    }


def _transcribe_document_parts(
    *,
    base_text: str = "",
    images: Optional[list[Image.Image]] = None,
    pdf_bytes: Optional[bytes] = None,
    pdf_filename: str = "document.pdf",
    label: str = "document",
) -> tuple[str, list[dict]]:
    assessment_system = get_assessment_system()
    page_results: list[dict] = []
    text_parts = [base_text.strip()] if base_text and base_text.strip() else []

    if pdf_bytes:
        text, pages = assessment_system.transcriber.run_pdf_with_pages(
            pdf_bytes,
            pdf_filename,
        )
        if text:
            text_parts.append(text)
        page_results.extend(page.as_dict() for page in pages)
    elif images:
        text, pages = assessment_system.transcriber.run_images_with_pages(
            images,
            label,
        )
        if text:
            text_parts.append(text)
        page_results.extend(page.as_dict() for page in pages)

    return _join_text("", text_parts), page_results


def _preview_single_payload(payload: dict) -> dict:
    question_paper_text, question_pages = _transcribe_document_parts(
        base_text=_join_text(payload["question_paper_text"], [payload["rubric_text"]]),
        images=payload.get("qp_images"),
        pdf_bytes=payload.get("qp_pdf_bytes"),
        pdf_filename=payload.get("qp_pdf_filename", "question_paper.pdf"),
        label="question-paper images",
    )
    student_answer_text, student_pages = _transcribe_document_parts(
        base_text=payload["student_answer_text"],
        images=payload.get("student_images"),
        pdf_bytes=payload.get("student_pdf_bytes"),
        pdf_filename=payload.get("student_pdf_filename", "student_submission.pdf"),
        label="student-submission images",
    )
    model_answer_text, model_pages = _transcribe_document_parts(
        base_text=payload["model_answer_text"],
        images=payload.get("model_answer_images"),
        pdf_bytes=payload.get("model_answer_pdf_bytes"),
        pdf_filename=payload.get("model_answer_pdf_filename", "model_answer.pdf"),
        label="official-model-answer images",
    )

    return {
        "mode": "single",
        "question_paper_text": question_paper_text,
        "rubric_text": "",
        "student_answer_text": student_answer_text,
        "model_answer_text": model_answer_text,
        "custom_instructions": payload.get("custom_instructions", ""),
        "question_paper_filename": payload.get("question_paper_filename", "question_paper"),
        "student_filename": payload.get("student_filename", "student_submission"),
        "ocr_pages": {
            "question_paper": question_pages,
            "student_answer": student_pages,
            "model_answer": model_pages,
        },
    }


def _fallback_ocr_page(text: str, source: str) -> list[dict]:
    clean_text = str(text or "").strip()
    if not clean_text:
        return []
    return [
        {
            "page": 1,
            "text": clean_text,
            "provider": "saved-text",
            "cached": False,
            "error": "",
            "source": source,
        }
    ]


def _normalize_saved_ocr_preview(context: dict) -> dict:
    preview = context.get("ocr_preview") or {}
    if isinstance(preview, dict) and isinstance(preview.get("ocr_pages"), dict):
        return {
            "question_paper": preview["ocr_pages"].get("question_paper", []),
            "student_answer": preview["ocr_pages"].get("student_answer", []),
            "model_answer": preview["ocr_pages"].get("model_answer", []),
        }
    if isinstance(preview, dict) and any(
        isinstance(preview.get(key), list)
        for key in ("question_paper", "student_answer", "model_answer")
    ):
        return {
            "question_paper": preview.get("question_paper", []),
            "student_answer": preview.get("student_answer", []),
            "model_answer": preview.get("model_answer", []),
        }
    return {
        "question_paper": _fallback_ocr_page(context.get("question_paper", ""), "final extracted question paper"),
        "student_answer": _fallback_ocr_page(context.get("student_work", ""), "final extracted student answer"),
        "model_answer": _fallback_ocr_page(context.get("answer_key", ""), "final/generated answer key"),
    }


@app.post("/api/ocr/preview")
async def preview_ocr(request: Request):
    get_user_email(request)
    form = await request.form()

    answer_files = [
        value
        for value in form.getlist("answer_files")
        if hasattr(value, "filename") and value.filename
    ]

    if answer_files:
        common_form = FormData([
            (key, value)
            for key, value in form.multi_items()
            if key not in {
                "answer_files",
                "student_ids",
            }
        ])
        shared_payload = _parse_uploads(common_form)
        preview = await asyncio.to_thread(_preview_single_payload, shared_payload)

        requested_ids = [
            str(value).strip()
            for value in form.getlist("student_ids")
        ]
        answers = []
        for index, upload in enumerate(answer_files):
            student_payload = _parse_batch_student_file(upload)
            text, pages = await asyncio.to_thread(
                _transcribe_document_parts,
                base_text=student_payload["student_answer_text"],
                images=student_payload["student_images"],
                pdf_bytes=student_payload["student_pdf_bytes"],
                pdf_filename=student_payload["student_pdf_filename"],
                label=f"student-submission images {index + 1}",
            )
            answers.append(
                {
                    "student_id": requested_ids[index] if index < len(requested_ids) and requested_ids[index] else upload.filename,
                    "filename": upload.filename,
                    "student_answer_text": text,
                    "ocr_pages": pages,
                }
            )

        preview["mode"] = "batch"
        preview["answers"] = answers
        preview.pop("student_answer_text", None)
        preview["student_filename"] = f"{len(answers)} answer files"
        return preview

    payload = _parse_uploads(form)
    return await asyncio.to_thread(_preview_single_payload, payload)


init_db()


@app.get("/api/models")
def get_pipeline_models():
    """Return the exact runtime configuration of the assessment pipeline."""
    transcriber_provider = "Bodhan AI" if BODHAN_OCR_ENABLED else "Google Gemini"
    transcriber_model = BODHAN_OCR_MODEL if BODHAN_OCR_ENABLED else TRANSCRIPTION_MODEL
    transcriber_cost = (
        "Billed per OCR page/request by Bodhan."
        if BODHAN_OCR_ENABLED
        else "Uses Gemini vision OCR because the configured Bodhan key is for indic-speak TTS."
    )

    return {
        "agents": [
            {
                "agent": "Transcriber",
                "role": "Multimodal Document Transcription",
                "provider": transcriber_provider,
                "model": transcriber_model,
                "type": "Vision",
                "cost_note": transcriber_cost,
                "desc": (
                    "Transcribes handwritten and typed PDFs/images "
                    "into structured Markdown while preserving questions, "
                    "mathematical notation, tables, and page boundaries."
                ),
            },
            {
                "agent": "Solver",
                "role": "Reference Answer Generation",
                "provider": "Google Gemini",
                "model": GRADING_MODEL,
                "type": "Reasoning",
                "cost_note": "One generation call when no official answer key is supplied.",
                "desc": (
                    "Generates a step-by-step reference answer key when "
                    "an official model answer is not provided."
                ),
            },
            {
                "agent": "Evaluator",
                "role": "Evidence-Anchored Rubric Grading",
                "provider": "Google Gemini",
                "model": GRADING_MODEL,
                "type": "Structured Output",
                "cost_note": "One structured grading call per student, plus visual checks when needed.",
                "desc": (
                    "Grades each answer against the rubric, assigns "
                    "criterion-level scores, cites student evidence, "
                    "and produces actionable feedback."
                ),
            },
            {
                "agent": "Auditor",
                "role": "Deterministic Score Validation",
                "provider": "Local",
                "model": "Python",
                "type": "Deterministic Guardrail",
                "cost_note": "No model cost.",
                "desc": (
                    "Checks score bounds, duplicate question IDs, "
                    "criterion totals, and arithmetic invariants "
                    "without using an LLM."
                ),
            },
            {
                "agent": "Regrade Agent",
                "role": "Evidence-Based Re-evaluation",
                "provider": "Google Gemini",
                "model": GRADING_MODEL,
                "type": "Verification",
                "cost_note": "Runs only when a re-evaluation is requested.",
                "desc": (
                    "Re-evaluates specific grading disputes and verifies "
                    "student evidence before allowing score changes."
                ),
            },
            {
                "agent": "Chat Agent",
                "role": "Assessment-Grounded Tutoring",
                "provider": "Google Gemini",
                "model": CHAT_MODEL,
                "type": "Interactive",
                "cost_note": "Runs per chat response with assessment context.",
                "desc": (
                    "Answers multi-turn student questions using the rubric, "
                    "reference answer, submission, and graded report as context."
                ),
            },
        ]
    }


@app.get("/api/system/check")
def get_system_check() -> dict:
    return {
        "bodhan_api_key": bool(BODHAN_API_KEY),
        "poppler_available": shutil.which("pdftoppm") is not None,
        "pdf_ocr_note": (
            "PDF OCR is ready."
            if shutil.which("pdftoppm") is not None
            else "PDF OCR needs Poppler. Install it with: brew install poppler"
        ),
    }


@app.post("/api/assess")
@app.post("/evaluate")
async def assess_submission(request: Request):
    try:
        # -----------------------------------------
        # Get browser/session identity FIRST
        # -----------------------------------------
        session_id = get_session_id(request)
        user_email = get_user_email(request)

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
        prior_weak_areas = format_weak_areas_for_prompt(get_student_memory(user_email))
        report, context = assessment_system.process_submission(
            **{
                key: value
                for key, value in payload.items()
                if key not in {
                    "question_paper_filename",
                    "student_filename",
                }
            },
            prior_weak_areas=prior_weak_areas,
            corrections_lookup=lambda qp: format_corrections_for_prompt(get_grading_corrections(qp)),
        )
        if payload.get("ocr_preview"):
            context["ocr_preview"] = payload["ocr_preview"]

        update_student_memory(user_email, report)

        assessment_id = save_assessment(
            report,
            context,
            payload["question_paper_filename"],
            payload["student_filename"],
            session_id=session_id,
            user_email=user_email,
        )

        response = _reshape_report(report, assessment_id)
        response["student_memory"] = get_student_memory(user_email)
        return response

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
    user_email = get_user_email(request)

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
            WHERE user_email = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (
                user_email,
                limit,
            ),
        ).fetchall()

    return {"assessments": [dict(row)for row in rows]}


@app.get("/api/assessments/{assessment_id}")
async def get_assessment(assessment_id: str, request: Request):
    user_email = get_user_email(request)
    report, _context = load_assessment(assessment_id, user_email)
    return _reshape_report(report, assessment_id)


@app.get("/api/assessments/{assessment_id}/ocr")
async def get_assessment_ocr(assessment_id: str, request: Request):
    user_email = get_user_email(request)
    with sqlite3.connect(DB_PATH) as connection:
        row = connection.execute(
            "SELECT context_json FROM assessments WHERE assessment_id = ? AND user_email = ?",
            (assessment_id, user_email),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Assessment not found.")
    context = json.loads(row[0])
    return {"ocr_preview": _normalize_saved_ocr_preview(context)}


@app.delete("/api/assessments/{assessment_id}")
async def delete_assessment(assessment_id: str, request: Request):
    user_email = get_user_email(request)
    with sqlite3.connect(DB_PATH) as connection:
        cursor = connection.execute(
            "DELETE FROM assessments WHERE assessment_id = ? AND user_email = ?",
            (assessment_id, user_email),
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

        user_email = get_user_email(request)
        _report, context = load_assessment(assessment_id, user_email)
        assessment_system = get_assessment_system()
        dispute = RegradeRequest(
            disputed_criterion=str(body.get("disputed_criterion") or "").strip() or None,
            claimed_mistake=claimed_mistake,
            evidence_quote=str(body.get("evidence_quote") or "").strip() or None,
        )
        result = assessment_system.regrade_question(context, question_id, dispute)
        persist_current_report(assessment_id, context["report"], context)

        if result.claim_verified and result.changed:
            record_grading_correction(
                question_paper=context["question_paper"],
                disputed_criterion=dispute.disputed_criterion or "",
                claimed_mistake=dispute.claimed_mistake,
                evidence_quote=dispute.evidence_quote or "",
                explanation=result.explanation,
            )

        return {
            "question": result.question.model_dump(),
            "changed": result.changed,
            "claim_verified": result.claim_verified,
            "explanation": result.explanation,
            "report": _reshape_report(context["report"], assessment_id),
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
        user_email = get_user_email(request)
        _report, context = load_assessment(assessment_id, user_email)
        assessment_system = get_assessment_system()

        conversation = [
            (str(item.get("role") or "user"), str(item.get("content") or "").strip())
            for item in body.get("messages", [])
            if isinstance(item, dict) and str(item.get("content") or "").strip()
        ]
        if not conversation:
            message = str(body.get("message") or body.get("user_message") or body.get("prompt") or "").strip()
            if not message:
                raise HTTPException(status_code=400, detail="No chat message was provided.")
            conversation = [("user", message)]

        reply = assessment_system.verify_and_chat(context, conversation)
        return {"answer": reply, "response": reply, "reply": reply}
    except HTTPException:
        raise
    except Exception as error:
        print(f"[Chat] Error: {error}")
        raise HTTPException(status_code=500, detail="Chat processing failed. Check server logs.")

@app.post("/api/chat/stream")
async def chat_stream_with_agent(payload: ChatRequest, request: Request):
    if not payload.assessment_id:
        raise HTTPException(
            status_code=400,
            detail="assessment_id is required."
        )

    if not payload.messages:
        raise HTTPException(
            status_code=400,
            detail="At least one chat message is required."
        )

    try:

        user_email = get_user_email(request)
        _report, loaded_context = load_assessment(payload.assessment_id, user_email)
        assessment_system = get_assessment_system()
        context = assessment_system._chat_context(loaded_context)

        conversation = "\n".join(
            f"{message.role.upper()}: {message.content}"
            for message in payload.messages[-10:]
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
        user_email = get_user_email(request)
        batch_id = str(uuid.uuid4())

        form = await request.form()
        preview_payload_raw = str(form.get("preview_payload") or "").strip()
        try:
            preview_payload = json.loads(preview_payload_raw) if preview_payload_raw else None
        except json.JSONDecodeError as error:
            raise HTTPException(status_code=422, detail="Invalid OCR preview payload.") from error

        answer_files = list(
            form.getlist("answer_files")
        )

        if not answer_files and not preview_payload:
            raise HTTPException(
                status_code=422,
                detail="No student answer sheets were provided.",
            )

        # Optional safety limit.
        max_batch_size = int(
            os.getenv("MAX_BATCH_SIZE", "25")
        )
        preview_answers = preview_payload.get("answers", []) if isinstance(preview_payload, dict) else []
        answer_count = len(preview_answers) if preview_payload else len(answer_files)

        if answer_count > max_batch_size:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Batch contains {answer_count} students; "
                    f"maximum allowed is {max_batch_size}."
                ),
            )

        if preview_payload:
            shared_payload = {
                "question_paper_text": str(preview_payload.get("question_paper_text") or ""),
                "rubric_text": str(preview_payload.get("rubric_text") or ""),
                "student_answer_text": "",
                "model_answer_text": str(preview_payload.get("model_answer_text") or ""),
                "custom_instructions": str(form.get("instructions") or preview_payload.get("custom_instructions") or ""),
                "qp_images": [],
                "student_images": [],
                "model_answer_images": [],
                "qp_pdf_bytes": None,
                "student_pdf_bytes": None,
                "model_answer_pdf_bytes": None,
                "qp_pdf_filename": str(preview_payload.get("question_paper_filename") or "question_paper"),
                "student_pdf_filename": "student_submission",
                "model_answer_pdf_filename": "model_answer",
                "question_paper_filename": str(preview_payload.get("question_paper_filename") or "question_paper"),
                "student_filename": "batch_preview",
            }
        else:
            # -------------------------------------------------
            # Parse common material WITHOUT answer_files.
            # This lets us reuse your existing upload parser.
            # -------------------------------------------------
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
            f"{answer_count} student(s)"
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
        students = []
        seen_ids = set()

        if preview_payload:
            for index, item in enumerate(preview_answers):
                student_id = str(item.get("student_id") or item.get("filename") or f"Student {index + 1}").strip()
                filename = str(item.get("filename") or student_id).strip()
                payload = {
                    "student_answer_text": str(item.get("student_answer_text") or ""),
                    "student_images": [],
                    "student_pdf_bytes": None,
                    "student_pdf_filename": filename,
                    "student_filename": filename,
                    "ocr_pages": item.get("ocr_pages") or [],
                }

                if not payload["student_answer_text"].strip():
                    continue

                original_id = student_id
                suffix = 2

                while student_id in seen_ids:
                    student_id = f"{original_id} ({suffix})"
                    suffix += 1

                seen_ids.add(student_id)

                students.append(
                    (
                        student_id,
                        filename,
                        payload,
                    )
                )
        else:
            requested_ids = [
                str(value).strip()
                for value in form.getlist("student_ids")
            ]

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
        if not students:
            raise HTTPException(
                status_code=422,
                detail="No readable student answer text was provided.",
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
                            user_email,
                            student_id,
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
                        "ocr_pages": payload.get("ocr_pages") or [],
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
            if preview_payload:
                context["ocr_preview"] = {
                    "question_paper": preview_payload.get("ocr_pages", {}).get("question_paper", []),
                    "model_answer": preview_payload.get("ocr_pages", {}).get("model_answer", []),
                    "student_answer": item.get("ocr_pages", []),
                }

            update_student_memory(user_email, report, student_key=student_id)

            assessment_id = save_assessment(
                report,
                context,
                shared_payload[
                    "question_paper_filename"
                ],
                item["filename"],
                session_id=session_id,
                batch_id=batch_id,
                user_email=user_email,
            )

            student_result = _reshape_report(report, assessment_id)
            student_result["student_memory"] = get_student_memory(user_email, student_key=student_id)
            results[student_id] = student_result

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

        print(
            f"[Batch] Finished {batch_id}: "
            f"{len(results)} succeeded, "
            f"{len(errors)} failed"
        )

        return {
            "batch_id": batch_id,
            "results": results,
            "errors": errors,
            "total": answer_count,
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
async def synthesize_voice(request: TTSRequest, raw_request: Request):
    """
    Synthesizes natural speech audio using Bodhan's OpenAI-compatible TTS API.
    Returns a playable audio stream directly to the frontend.
    """
    get_user_email(raw_request)
    clean_text = _trim_for_speech(_clean_for_speech(request.text))
    if not clean_text:
        raise HTTPException(status_code=400, detail="Empty text provided")

    client = get_tts_client()
    try:
        speech = await asyncio.to_thread(
            client.audio.speech.create,
            model=TTS_MODEL,
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
