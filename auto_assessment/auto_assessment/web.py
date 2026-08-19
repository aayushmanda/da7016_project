import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auto_assessment.web")
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect
from google.genai.types import LiveConnectConfig, Modality

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import asyncio
from agent import AssessmentReport, RegradeRequest, RubricAssessmentAgent
from document_parser import extract_content_from_file
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from google import genai
from google.genai import types
from google.genai.types import LiveConnectConfig, Modality



class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    assessment_id: Optional[str] = None
    messages: List[ChatMessage]

app = FastAPI(title="Auto Assessment API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

assessment_system = RubricAssessmentAgent()
DB_PATH = Path(__file__).with_name("assessment_history.db")
QUESTION_HINTS = ("question", "ques", "qp", "paper", "rubric")
STUDENT_HINTS = ("student", "answer", "submission", "response", "solution")


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS assessments (
                assessment_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                question_paper_filename TEXT NOT NULL DEFAULT '',
                student_filename TEXT NOT NULL DEFAULT '',
                score REAL NOT NULL,
                max_score REAL NOT NULL,
                report_json TEXT NOT NULL,
                context_json TEXT NOT NULL
            )
        """)


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


def save_assessment(
    report: AssessmentReport,
    context: dict,
    question_paper_filename: str,
    student_filename: str,
) -> str:
    assessment_id = str(uuid.uuid4())
    score, max_score = _report_totals(report)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            INSERT INTO assessments (
                assessment_id, created_at, question_paper_filename, student_filename,
                score, max_score, report_json, context_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                assessment_id,
                datetime.now(timezone.utc).isoformat(),
                question_paper_filename,
                student_filename,
                score,
                max_score,
                report.model_dump_json(),
                json.dumps(context, default=str),
            ),
        )
    return assessment_id


def load_assessment(assessment_id: str) -> AssessmentReport:
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
    qp_text = str(form.get("question_paper_text") or form.get("question_paper") or "")
    rubric_text = str(form.get("rubric_text") or form.get("rubric") or "")
    student_text = str(form.get("student_answer_text") or form.get("student_text") or "")
    model_answer_text = str(form.get("model_answer_text") or form.get("model_answer") or "")
    custom_instructions = str(form.get("custom_instructions") or form.get("instructions") or "")

    qp_images: list[Image.Image] = []
    student_images: list[Image.Image] = []
    qp_text_parts: list[str] = []
    student_text_parts: list[str] = []
    qp_pdf_bytes: Optional[bytes] = None
    student_pdf_bytes: Optional[bytes] = None
    qp_filename = "question_paper"
    student_filename = "student_submission"

    for field_name in form.keys():
        for value in form.getlist(field_name):
            if not (hasattr(value, "filename") and value.filename):
                continue
            file_bytes = value.file.read()
            if not file_bytes:
                raise HTTPException(status_code=422, detail=f"{value.filename!r} is empty.")

            parsed = extract_content_from_file(value.filename, file_bytes)
            if parsed.error:
                raise HTTPException(
                    status_code=422,
                    detail=f"Could not process {value.filename!r}: {parsed.error}",
                )

            if _is_question_file(field_name, value.filename):
                qp_filename = parsed.filename
                qp_text_parts.append(parsed.text)
                qp_images.extend(parsed.images)
                if parsed.pdf_bytes:
                    if qp_pdf_bytes:
                        raise HTTPException(status_code=422, detail="Use one question-paper PDF per request.")
                    qp_pdf_bytes = parsed.pdf_bytes
            else:
                student_filename = parsed.filename
                student_text_parts.append(parsed.text)
                student_images.extend(parsed.images)
                if parsed.pdf_bytes:
                    if student_pdf_bytes:
                        raise HTTPException(status_code=422, detail="Use one student-answer PDF per request.")
                    student_pdf_bytes = parsed.pdf_bytes

    return {
        "question_paper_text": _join_text(qp_text, qp_text_parts),
        "rubric_text": rubric_text,
        "student_answer_text": _join_text(student_text, student_text_parts),
        "model_answer_text": model_answer_text,
        "custom_instructions": custom_instructions,
        "qp_images": qp_images,
        "student_images": student_images,
        "qp_pdf_bytes": qp_pdf_bytes,
        "student_pdf_bytes": student_pdf_bytes,
        "qp_pdf_filename": qp_filename,
        "student_pdf_filename": student_filename,
        "question_paper_filename": qp_filename,
        "student_filename": student_filename,
    }


init_db()


@app.get("/api/models")
def get_pipeline_models():
    """Returns dynamic model inspection metadata across all pipeline agents."""
    transcription_model = os.getenv("GEMINI_TRANSCRIPTION_MODEL", "gemini-2.5-flash")
    grading_model = os.getenv("GEMINI_GRADING_MODEL", "gemini-2.5-flash")
    chat_model = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")

    return {
        "agents": [
            {
                "agent": "Transcriber",
                "role": "Multimodal OCR & Document Parsing",
                "model": transcription_model,
                "type": "Vision",
                "desc": "Converts handwritten and typed PDFs/images into clean, structured Markdown."
            },
            {
                "agent": "Solver",
                "role": "Master Reference Solution Key",
                "model": grading_model,
                "type": "Reasoning",
                "desc": "Generates step-by-step master answer key when no official key is provided."
            },
            {
                "agent": "Evaluator",
                "role": "Evidence-Anchored Grading & Rules",
                "model": grading_model,
                "type": "Structured JSON",
                "desc": "Evaluates student work against criteria with verbatim evidence quotes and next-time rules."
            },
            {
                "agent": "Auditor",
                "role": "Score Invariant & Arithmetic Validation",
                "model": "Python Deterministic",
                "type": "Code Guardrail",
                "desc": "Validates score arithmetic, criterion sums, and bounding invariants in pure Python code."
            },
            {
                "agent": "Regrade Agent",
                "role": "Dispute & Evidence Verification",
                "model": grading_model,
                "type": "Auditing",
                "desc": "Audits falsifiable student disputes by verifying quoted evidence against raw submissions."
            },
            {
                "agent": "Chat Agent",
                "role": "Contextual Dialogue & Voice Tutoring",
                "model": chat_model,
                "type": "Interactive",
                "desc": "Multi-turn tutoring agent answering student queries grounded in grading context."
            }
        ]
    }


@app.post("/api/assess")
@app.post("/evaluate")
async def assess_submission(request: Request):
    try:
        payload = _parse_uploads(await request.form())
        if not (payload["question_paper_text"] or payload["qp_images"] or payload["qp_pdf_bytes"]):
            raise HTTPException(status_code=422, detail="No readable question paper was provided.")
        if not (payload["student_answer_text"] or payload["student_images"] or payload["student_pdf_bytes"]):
            raise HTTPException(status_code=422, detail="No readable student answer was provided.")

        print(
            f"[Upload] QP text={len(payload['question_paper_text'])}, QP images={len(payload['qp_images'])}, "
            f"QP PDF={bool(payload['qp_pdf_bytes'])}; Student text={len(payload['student_answer_text'])}, "
            f"Student images={len(payload['student_images'])}, Student PDF={bool(payload['student_pdf_bytes'])}"
        )
        report = assessment_system.process_submission(**{
            key: value for key, value in payload.items()
            if key not in {"question_paper_filename", "student_filename"}
        })
        assessment_id = save_assessment(
            report,
            assessment_system.last_context,
            payload["question_paper_filename"],
            payload["student_filename"],
        )
        return _reshape_report(report, assessment_id)
    except HTTPException:
        raise
    except ValueError as error:
        print(f"[Assessment] Validation error: {error}")
        raise HTTPException(status_code=422, detail=str(error))
    except Exception as error:
        print(f"[Assessment] Unexpected error: {error}")
        raise HTTPException(status_code=500, detail="Assessment processing failed. Check server logs.")



@app.get("/api/assessments/recent")
async def recent_assessments():
    with sqlite3.connect(DB_PATH) as connection:
        connection.row_factory = sqlite3.Row
        rows = connection.execute(
            """
            SELECT assessment_id, created_at, question_paper_filename, student_filename, score, max_score
            FROM assessments ORDER BY created_at DESC LIMIT 3
            """
        ).fetchall()
    return {"assessments": [dict(row) for row in rows]}


@app.get("/api/assessments/{assessment_id}")
async def get_assessment(assessment_id: str):
    report = load_assessment(assessment_id)
    return _reshape_report(report, assessment_id)


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
    """Real-time token streaming endpoint for word-by-word interactive responses."""
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    chat_model = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")

    context_str = ""
    if request.assessment_id:
        record = get_assessment(request.assessment_id)
        if record:
            context_str = (
                f"Active Assessment Context:\n"
                f"Total Score: {record.get('total_score', 'N/A')}/{record.get('max_score', 'N/A')} "
                f"({record.get('percentage', 'N/A')}%)\n"
                f"Strengths: {json.dumps(record.get('key_strengths', []))}\n"
                f"Focus Areas: {json.dumps(record.get('priority_focus', []))}\n"
                f"Questions & Criteria: {json.dumps(record.get('questions', []))}\n"
            )

    conversation_history = "\n".join([f"{m.role.capitalize()}: {m.content}" for m in request.messages])
    system_prompt = (
        "You are an encouraging, expert academic grading tutor assisting a student. "
        "Answer their questions clearly, concisely, and helpfully based on their assessment feedback.\n\n"
        f"{context_str}\n\n"
        f"Conversation History:\n{conversation_history}\n\n"
        "Assistant:"
    )

    def token_generator():
        try:
            stream = client.models.generate_content_stream(
                model=chat_model,
                contents=[system_prompt]
            )
            for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as err:
            logger.error(f"Stream chunk error: {err}")
            yield f"\n[Streaming error: {str(err)}]"

    return StreamingResponse(token_generator(), media_type="text/plain")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web:app", host="0.0.0.0", port=8000, reload=True)
class TTSRequest(BaseModel):
    text: str

@app.post("/api/voice/synthesize")
async def synthesize_voice(request: TTSRequest):
    """
    Synthesizes natural speech audio on the backend using Google Gemini Audio / gTTS.
    Returns playable audio/mp3 stream directly to the frontend.
    """
    clean_text = re.sub(r'[*#_`\[\]()]', '', request.text).strip()
    if not clean_text:
        raise HTTPException(status_code=400, detail="Empty text provided")

    # Try backend generation
    try:
        from gtts import gTTS
        import io
        mp3_fp = io.BytesIO()
        tts = gTTS(text=clean_text[:500], lang='en', slow=False)
        tts.write_to_fp(mp3_fp)
        mp3_fp.seek(0)
        return StreamingResponse(mp3_fp, media_type="audio/mpeg")
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail="Voice synthesis failed")
