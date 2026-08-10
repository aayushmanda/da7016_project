from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from auto_assessment.llm import create_agent


class ChatPayload(BaseModel):
    messages: list[Dict[str, Any]]


app = FastAPI(
    title="Auto-Assessment API",
    description="A rubric-defensible grading API compatible with uvicorn.",
    version="0.1.0",
)

frontend_dir = Path(__file__).resolve().parents[1] / "frontend"
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "auto-assessment"}


@app.post("/api/assess")
def assess(
    payload: str = Form(...),
    file: UploadFile | None = File(None),
) -> Dict[str, Any]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        return {"error": f"Invalid payload JSON: {exc.msg}"}

    if file:
        data["uploaded_file"] = file.filename

    agent = create_agent()
    prompt = (
        "Grade this answer sheet against the rubric. Return a JSON object with question_id, score, "
        "feedback, and criterion_scores for each item.\n\n"
        + json.dumps(data, indent=2)
    )
    result = agent.invoke({"messages": [{"content": prompt}]})
    content = result["messages"][-1]["content"]

    if isinstance(content, str):
        try:
            parsed = json.loads(content)
            return {"result": parsed}
        except json.JSONDecodeError:
            return {"result": str(content)}

    return {"result": content}


@app.post("/api/chat")
def chat(payload: ChatPayload) -> Dict[str, Any]:
    messages = payload.messages
    prompt = messages[-1]["content"] if messages else ""
    agent = create_agent()
    result = agent.invoke({"messages": [{"content": prompt}]})
    content = result["messages"][-1]["content"]

    return {"answer": content}
