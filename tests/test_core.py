import os
import sys
import unittest
from pathlib import Path

from PIL import Image
from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_ROOT = PROJECT_ROOT / "auto_assessment" / "auto_assessment"
sys.path.insert(0, str(PACKAGE_ROOT))

from agent import (  # noqa: E402
    AssessmentReport,
    BODHAN_OCR_ENABLED,
    CriterionScore,
    OcrPageResult,
    QuestionEvaluation,
    TranscriberAgent,
    validate_report,
)
from document_parser import extract_content_from_file  # noqa: E402
from web import app  # noqa: E402


class CoreBehaviorTests(unittest.TestCase):
    def test_text_file_parsing(self):
        parsed = extract_content_from_file("rubric.txt", b"Q1: 5 marks\n")

        self.assertEqual(parsed.text, "Q1: 5 marks")
        self.assertEqual(parsed.mime_type, "text/plain")
        self.assertIsNone(parsed.error)

    def test_auth_config_endpoint(self):
        client = TestClient(app)
        response = client.get("/api/auth/config")

        self.assertEqual(response.status_code, 200)
        self.assertIn("google_client_id", response.json())

    def test_models_endpoint_reflects_bodhan_ocr(self):
        client = TestClient(app)
        response = client.get("/api/models")

        self.assertEqual(response.status_code, 200)
        agents = {item["agent"]: item for item in response.json()["agents"]}
        expected_provider = "Bodhan AI" if os.getenv("USE_BODHAN_OCR", "").lower() in {"1", "true", "yes", "on"} else "Google Gemini"
        self.assertEqual(agents["Transcriber"]["provider"], expected_provider)

    def test_ocr_page_failure_is_preserved_without_crashing(self):
        transcriber = TranscriberAgent(client=None)

        def fake_ocr_page(_image, _label, page_number):
            return OcrPageResult(page=page_number, error="temporary OCR outage")

        if BODHAN_OCR_ENABLED:
            transcriber._run_bodhan_ocr_page = fake_ocr_page
        else:
            transcriber._run_gemini_ocr_page = fake_ocr_page

        text, pages = transcriber.run_images_with_pages(
            [Image.new("RGB", (12, 12), "white")],
            "answer sheet",
        )

        self.assertEqual(text, "")
        self.assertEqual(pages[0].error, "temporary OCR outage")

    def test_report_validation_flags_duplicate_ids_and_bad_totals(self):
        report = AssessmentReport(
            evaluations=[
                QuestionEvaluation(
                    question_id="Q1",
                    score=2,
                    max_score=5,
                    criterion_scores=[
                        CriterionScore(description="method", score=1, weight=3),
                    ],
                    feedback="Partial method shown.",
                ),
                QuestionEvaluation(
                    question_id="Q1",
                    score=3,
                    max_score=5,
                    feedback="Correct final answer.",
                ),
            ]
        )

        errors = validate_report(report)

        self.assertTrue(any("duplicate question ID: Q1" in error for error in errors))
        self.assertTrue(any("criterion total 1.0 does not equal score 2.0" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
