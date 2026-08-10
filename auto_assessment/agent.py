from __future__ import annotations

import os
import re
from typing import Any, Dict, List


class AssessmentAgent:
    """A lightweight rubric-based assessment agent.

    This implementation is intentionally deterministic and dependency-light so it
    can serve as a strong baseline for the project while remaining easy to extend
    with an LLM backend later.
    """

    def __init__(self, model_name: str | None = None) -> None:
        self.model_name = model_name or os.getenv("ASSESSMENT_MODEL", "baseline")

    def assess_payload(self, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        questions = payload.get("questions", [])
        answers = payload.get("answers", {})
        results: List[Dict[str, Any]] = []

        for question in questions:
            question_id = question.get("id", "unknown")
            student_answer = answers.get(question_id, "")
            model_answer = question.get("model_answer", "")
            rubric = question.get("rubric", [])

            criterion_scores = []
            total_score = 0.0
            total_weight = 0

            for criterion in rubric:
                description = criterion.get("description", "")
                weight = int(criterion.get("weight", 0))
                total_weight += weight
                criterion_score = self._score_criterion(student_answer, model_answer, description, weight)
                criterion_scores.append(
                    {
                        "description": description,
                        "weight": weight,
                        "score": criterion_score,
                        "feedback": self._criterion_feedback(description, criterion_score, weight),
                    }
                )
                total_score += criterion_score

            normalized_score = round((total_score / total_weight) * 10, 2) if total_weight else 0.0
            feedback = self._compose_feedback(question_id, student_answer, model_answer, criterion_scores)
            results.append(
                {
                    "question_id": question_id,
                    "score": normalized_score,
                    "feedback": feedback,
                    "criterion_scores": criterion_scores,
                }
            )

        return results

    def _score_criterion(self, student_answer: str, model_answer: str, description: str, weight: int) -> float:
        combined_text = f"{student_answer} {model_answer}".lower()
        stopwords = {
            "defines",
            "define",
            "explains",
            "explain",
            "provides",
            "provide",
            "a",
            "an",
            "the",
            "and",
            "or",
            "of",
            "with",
            "to",
            "clear",
            "student",
            "answer",
            "learning",
        }
        desc_terms = [term for term in re.findall(r"\w+", description.lower()) if term not in stopwords]
        if not desc_terms:
            return 0.0

        matched = sum(1 for term in desc_terms if term in combined_text)
        overlap_ratio = matched / len(desc_terms)

        if overlap_ratio >= 0.8:
            return float(weight)
        if overlap_ratio >= 0.5:
            return round(weight * 0.6, 2)
        if overlap_ratio > 0:
            return round(weight * 0.3, 2)
        return 0.0

    def _criterion_feedback(self, description: str, score: float, weight: int) -> str:
        if score >= weight:
            return f"Strong alignment with the rubric point: {description}."
        if score >= weight * 0.5:
            return f"Partial alignment with the rubric point: {description}. Add more precision or evidence to fully meet the expectation."
        return f"Missing or weak coverage of the rubric point: {description}. Expand on this area to improve your answer."

    def _compose_feedback(
        self,
        question_id: str,
        student_answer: str,
        model_answer: str,
        criterion_scores: List[Dict[str, Any]],
    ) -> str:
        improvement_parts = []
        for criterion in criterion_scores:
            if criterion["score"] < criterion["weight"]:
                improvement_parts.append(criterion["feedback"])

        if not improvement_parts:
            return "Your answer is well aligned with the rubric and covers the key expectations clearly."

        return (
            "The answer is on the right track, but the following rubric items need stronger coverage: "
            + " ".join(improvement_parts)
        )
