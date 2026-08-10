from __future__ import annotations

import json
import os
from typing import Any, Dict

from auto_assessment.agent import AssessmentAgent

try:
    import openai
except ImportError:
    openai = None  # type: ignore


class LLMAssessmentAgent:
    """LLM agent wrapper with direct document prompt construction."""

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or os.getenv("ASSESSMENT_MODEL", "gpt-3.5-turbo")
        self.assessor = AssessmentAgent()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "")
        if self.openai_api_key and openai:
            openai.api_key = self.openai_api_key

    def invoke(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        messages = payload.get("messages", [])
        if not messages:
            raise ValueError("Payload must include a messages list.")

        message = messages[-1]
        query = self._extract_text(message if isinstance(message, dict) else message.content)

        if self.openai_api_key and openai:
            content = self._grade_with_openai(query)
        else:
            content = self._fallback_response(query, payload)

        return {"messages": [{"content": content}]}

    def _extract_text(self, content: str | list[dict] | dict) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, dict):
            return self._extract_text(content.get("content", ""))
        if isinstance(content, list):
            return " ".join(str(item) for item in content)
        return str(content)

    def _grade_with_openai(self, query: str) -> str:
        completion = openai.ChatCompletion.create(
            model=self.model_name,
            messages=[{"role": "user", "content": query}],
            temperature=0.0,
            max_tokens=1200,
        )
        return completion.choices[0].message.content

    def _fallback_response(self, query: str, payload: Dict[str, Any]) -> str:
        rubric_info = payload.get("rubric_info") or {}
        answer_info = payload.get("answer_info") or {}

        mock_result = [
            {
                "question_id": "Question 1",
                "score": 8.5,
                "feedback": f"Evaluated document: {answer_info.get('filename', 'Student Answer Sheet')}. Good explanation of main concepts.",
                "criterion_scores": [
                    {"description": "Core Concept Accuracy", "weight": 5, "score": 4.5},
                    {"description": "Clarity & Organization", "weight": 5, "score": 4.0},
                ],
            },
            {
                "question_id": "Question 2",
                "score": 7.0,
                "feedback": "Covered key practical applications, but missing specific real-world examples.",
                "criterion_scores": [
                    {"description": "Identifies domain", "weight": 5, "score": 4.0},
                    {"description": "Provides examples", "weight": 5, "score": 3.0},
                ],
            },
        ]

        if "Evaluate the provided student answer" in query:
            return json.dumps(mock_result, indent=2)

        return "I am the Auto-Assessment agent. Upload your documents to begin automated grading."


def create_agent(model_name: str | None = None) -> LLMAssessmentAgent:
    return LLMAssessmentAgent(model_name=model_name)
    