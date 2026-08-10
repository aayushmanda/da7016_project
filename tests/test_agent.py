import json
from pathlib import Path

from auto_assessment.agent import AssessmentAgent
from auto_assessment.llm import LLMAssessmentAgent


def test_assessment_agent_returns_scores_and_feedback_for_basic_rubric():
    agent = AssessmentAgent()
    payload = {
        "questions": [
            {
                "id": "q1",
                "prompt": "Explain the difference between supervised and unsupervised learning.",
                "model_answer": "Supervised learning uses labeled data to train a model, whereas unsupervised learning finds patterns in unlabeled data.",
                "rubric": [
                    {"description": "Defines supervised learning", "weight": 4},
                    {"description": "Defines unsupervised learning", "weight": 4},
                    {"description": "Provides a clear contrast", "weight": 2},
                ],
            }
        ],
        "answers": {"q1": "Supervised learning uses labeled data. Unsupervised learning finds patterns in unlabeled data."},
    }

    results = agent.assess_payload(payload)

    assert len(results) == 1
    assert results[0]["question_id"] == "q1"
    assert 8 <= results[0]["score"] <= 10
    assert "feedback" in results[0]
    assert len(results[0]["criterion_scores"]) == 3
    assert any("contrast" in criterion["description"].lower() for criterion in results[0]["criterion_scores"])


def test_llm_assessment_agent_fallback_response_contains_hint():
    agent = LLMAssessmentAgent()
    response = agent.invoke({"messages": [{"content": "Please grade the answer sheet using the rubric."}]})

    assert isinstance(response, dict)
    assert "messages" in response
    assert "grade" in response["messages"][0]["content"].lower()
