from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from auto_assessment.agent import AssessmentAgent

try:
    import openai
except ImportError:  # pragma: no cover
    openai = None  # type: ignore


@dataclass
class HumanMessage:
    content: str | list[dict] | dict


class LLMAssessmentAgent:
    """A minimal LLM wrapper with a LangChain-style invoke interface.

    This wrapper can run a simple OpenAI chat completion when OPENAI_API_KEY is
    configured. Otherwise it falls back to the deterministic rubric-based
    assessment engine.
    """

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

        if self.openai_api_key and openai and "grade" in query.lower() and "rubric" in query.lower():
            content = self._grade_with_openai(query)
        else:
            content = self._fallback_response(query)

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
        payload = self._build_openai_payload(query)
        completion = openai.ChatCompletion.create(**payload)
        return completion.choices[0].message.content

    def _build_openai_payload(self, query: str) -> Dict[str, Any]:
        return {
            "model": self.model_name,
            "messages": [{"role": "user", "content": query}],
            "temperature": 0.0,
            "max_tokens": 900,
        }

    def _fallback_response(self, query: str) -> str:
        if "grade" in query.lower() and "rubric" in query.lower():
            return (
                "I can grade answer sheets via the CLI with a rubric-based engine. "
                "Use the `assess` command and supply a JSON payload file. "
                "Set OPENAI_API_KEY to enable a richer LLM-based grading mode."
            )

        return (
            "This auto-assessment agent supports rubric grading and direct questions about "
            "student answer quality. Run the CLI with a payload file or configure OPENAI_API_KEY "
            "to use the LLM grading mode."
        )

    def _extract_text(self, content: str | list[dict] | dict) -> str:
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(str(item) for item in content)
        return str(content)


def create_agent(model_name: str | None = None) -> LLMAssessmentAgent:
    return LLMAssessmentAgent(model_name=model_name)
