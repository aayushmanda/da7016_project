from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auto_assessment.agent import AssessmentAgent
from auto_assessment.llm import create_agent


class AssessmentPayload(BaseModel):
    questions: list[Dict[str, Any]]
    answers: Dict[str, Any] = {}


app = FastAPI(
    title="Auto-Assessment API",
    description="A rubric-defensible grading API compatible with uvicorn.",
    version="0.1.0",
)

app.mount("/static", StaticFiles(directory="frontend"), name="static")


@app.get("/")
def frontend() -> FileResponse:
    return FileResponse("frontend/index.html")


@app.get("/health")
def health_check() -> Dict[str, str]:
    return {"status": "ok", "service": "auto-assessment"}


@app.post("/assess")
def assess(payload: AssessmentPayload, llm: bool = Query(False, description="Use LLM-based grading")) -> Dict[str, Any]:
    data = payload.dict()

    if llm:
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

    results = AssessmentAgent().assess_payload(data)
    return {"results": results}
