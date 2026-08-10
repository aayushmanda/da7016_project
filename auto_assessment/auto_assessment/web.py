from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from auto_assessment.llm import create_agent


class ChatPayload(BaseModel):
    messages: list[Dict[str, Any]]
    has_assessment: bool = False

    class Config:
        extra = "allow"


app = FastAPI(
    title="Auto-Assessment API",
    description="Document-first grading API",
    version="0.2.0",
)

frontend_dir = Path(__file__).resolve().parents[1] / "frontend"
uploads_dir = Path(__file__).resolve().parents[1] / "uploads"
uploads_dir.mkdir(exist_ok=True)


def _save_uploaded_file(upload: UploadFile) -> Dict[str, Any]:
    file_bytes = upload.file.read()
    saved_filename = f"{uuid4().hex}_{upload.filename}"
    saved_path = uploads_dir / saved_filename
    saved_path.write_bytes(file_bytes)

    extracted_text = ""
    if upload.content_type and "text" in upload.content_type:
        try:
            extracted_text = file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            pass

    return {
        "filename": upload.filename,
        "content_type": upload.content_type,
        "size": len(file_bytes),
        "saved_path": str(saved_path),
        "text_content": extracted_text,
    }


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "auto-assessment"}


@app.post("/api/assess")
def assess(
    rubric_file: UploadFile | None = File(None),
    answer_file: UploadFile | None = File(None),
    instructions: str | None = Form(None),
) -> Dict[str, Any]:
    if not rubric_file and not answer_file:
        return {"error": "Please upload at least an answer sheet or rubric file."}

    rubric_info = _save_uploaded_file(rubric_file) if rubric_file else None
    answer_info = _save_uploaded_file(answer_file) if answer_file else None

    prompt = (
        "You are an expert grading agent. Evaluate the provided student answer sheet against the rubric document.\n"
        "Return a strictly formatted JSON array where each object contains:\n"
        "- question_id: string (e.g. 'Question 1')\n"
        "- score: float score out of 10\n"
        "- feedback: detailed feedback summary\n"
        "- criterion_scores: list of objects with {description, weight, score}\n\n"
    )

    if instructions:
        prompt += f"Custom Grading Instructions:\n{instructions}\n\n"

    if rubric_info:
        prompt += f"Rubric File: {rubric_info['filename']} ({rubric_info['size']} bytes)\n"
        if rubric_info["text_content"]:
            prompt += f"Rubric Content:\n{rubric_info['text_content']}\n\n"

    if answer_info:
        prompt += f"Answer Sheet File: {answer_info['filename']} ({answer_info['size']} bytes)\n"
        if answer_info["text_content"]:
            prompt += f"Answer Content:\n{answer_info['text_content']}\n\n"

    agent = create_agent()
    result = agent.invoke({
        "messages": [{"content": prompt}],
        "rubric_info": rubric_info,
        "answer_info": answer_info,
    })

    content = result["messages"][-1]["content"]

    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            return {"result": parsed, "rubric_file": rubric_info, "answer_file": answer_info}
        except json.JSONDecodeError:
            return {"result": content, "rubric_file": rubric_info, "answer_file": answer_info}

    return {"result": content, "rubric_file": rubric_info, "answer_file": answer_info}


@app.post("/api/chat")
def chat(payload: ChatPayload) -> Dict[str, Any]:
    messages = payload.messages
    prompt = messages[-1]["content"] if messages else ""

    agent = create_agent()
    result = agent.invoke({"messages": [{"content": prompt}]})
    content = result["messages"][-1]["content"]

    return {"answer": content}


if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")