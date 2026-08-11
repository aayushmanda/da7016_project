import io
import os
from typing import List
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from agent import RubricAssessmentAgent, RegradeRequest
from document_parser import extract_content_from_file

app = FastAPI(title="Multi-Agent Assessment API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

assessment_system = RubricAssessmentAgent()


def _is_qp_field(key: str, filename: str) -> bool:
    key_l, fname_l = key.lower(), filename.lower()
    return any(k in key_l or k in fname_l for k in ["ques", "qp", "paper", "rubric", "1"])


def _reshape_report(report) -> dict:
    report_data = report.model_dump()
    return {
        "result": report_data["evaluations"],
        "overall_summary": report_data["overall_summary"],
        **report_data,
    }


# =====================================================================
# API ENDPOINTS
# =====================================================================
@app.post("/api/assess")
@app.post("/evaluate")
async def assess_submission(request: Request):
    """
    Parses uploaded form files (PDF / image / plain text) and text fields
    regardless of the field names sent by the frontend UI.
    """
    try:
        form = await request.form()

        qp_text = str(form.get("question_paper_text") or form.get("question_paper") or "")
        rubric_text = str(form.get("rubric_text") or form.get("rubric") or "")
        student_text = str(form.get("student_answer_text") or form.get("student_text") or form.get("student_answer") or "")
        custom_instructions = str(form.get("custom_instructions") or form.get("instructions") or "")

        qp_images: List[Image.Image] = []
        student_images: List[Image.Image] = []
        qp_extracted_text: List[str] = []
        student_extracted_text: List[str] = []

        for key in form.keys():
            form_fields = form.getlist(key) if hasattr(form, "getlist") else [form[key]]
            for val in form_fields:
                if not (hasattr(val, "filename") and val.filename):
                    continue
                content = await val.read()
                if not content:
                    continue

                try:
                    text, imgs = extract_content_from_file(val.filename, content)
                except Exception as parse_err:
                    print(f"Could not parse file '{val.filename}': {parse_err}")
                    continue

                if _is_qp_field(key, val.filename):
                    if text:
                        qp_extracted_text.append(text)
                    qp_images.extend(imgs)
                else:
                    if text:
                        student_extracted_text.append(text)
                    student_images.extend(imgs)

        if qp_extracted_text:
            qp_text = (qp_text + "\n\n" + "\n\n".join(qp_extracted_text)).strip()
        if student_extracted_text:
            student_text = (student_text + "\n\n" + "\n\n".join(student_extracted_text)).strip()

        print(f"Loaded {len(qp_images)} Question Paper image(s) & {len(student_images)} Student Solution image(s). "
              f"QP text chars={len(qp_text)}, Student text chars={len(student_text)}.")

        report = assessment_system.process_submission(
            question_paper_text=qp_text,
            rubric_text=rubric_text,
            student_answer_text=student_text,
            qp_images=qp_images,
            student_images=student_images,
            custom_instructions=custom_instructions,
        )

        return _reshape_report(report)

    except Exception as e:
        print(f"Assessment Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/regrade")
async def regrade_question(request: Request):
    """
    Re-evaluates a single question from the most recent assessment, based on
    a STRUCTURED dispute rather than a vague "please regrade this".

    Expects JSON:
    {
      "question_id": "Question 1",
      "claimed_mistake": "You said I didn't show the chain rule, but I did.",
      "disputed_criterion": "Correct use of chain rule",   // optional
      "evidence_quote": "d/dx[f(g(x))] = f'(g(x)) * g'(x)"  // optional but recommended
    }

    `claimed_mistake` is required — a vague reason with no specific claim is
    rejected, since the evaluator needs a falsifiable claim to check, not a
    generic "be nicer" request.

    Returns the updated single-question evaluation plus the full, reshaped
    report (same shape as /api/assess) so the frontend can either patch one
    card in place or just replace `response` wholesale.
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        question_id = str(body.get("question_id") or "").strip()
        claimed_mistake = str(body.get("claimed_mistake") or body.get("reason") or "").strip()
        disputed_criterion = body.get("disputed_criterion")
        evidence_quote = body.get("evidence_quote")

        if not question_id:
            raise HTTPException(status_code=400, detail="question_id is required.")
        if not claimed_mistake or len(claimed_mistake) < 8:
            raise HTTPException(
                status_code=400,
                detail="claimed_mistake is required and must name a specific error "
                       "(e.g. 'You said I didn't show step X, but I did in line 3'), "
                       "not a generic complaint.",
            )

        dispute = RegradeRequest(
            disputed_criterion=str(disputed_criterion).strip() if disputed_criterion else None,
            claimed_mistake=claimed_mistake,
            evidence_quote=str(evidence_quote).strip() if evidence_quote else None,
        )

        result = assessment_system.regrade_question(question_id, dispute)

        return {
            "question": result.question.model_dump(),
            "changed": result.changed,
            "claim_verified": result.claim_verified,
            "explanation": result.explanation,
            "report": _reshape_report(assessment_system.last_context["report"]),
        }

    except HTTPException:
        raise
    except (RuntimeError, ValueError) as e:
        print(f"Regrade Error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Regrade Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
@app.post("/chat")
async def chat_with_agent(request: Request):
    """
    Accepts either:
      - {"message": "..."} / {"user_message": "..."} / {"prompt": "..."} / {"query": "..."} /
        {"text": "..."} / {"content": "..."}   (flat string, legacy support)
      - {"messages": [{"role": "user", "content": "..."}, ...]}  (array shape sent by App.jsx)
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        user_msg = (
            body.get("message") or
            body.get("user_message") or
            body.get("prompt") or
            body.get("query") or
            body.get("text") or
            body.get("content") or
            ""
        ).strip()

        if not user_msg:
            messages = body.get("messages")
            if isinstance(messages, list):
                for msg in reversed(messages):
                    if isinstance(msg, dict) and msg.get("role") == "user" and msg.get("content"):
                        user_msg = str(msg["content"]).strip()
                        break

        if not user_msg:
            raise HTTPException(status_code=400, detail="No message body provided in chat payload.")

        reply = assessment_system.verify_and_chat(user_msg)

        return {
            "answer": reply,
            "response": reply,
            "reply": reply,
            "message": reply,
            "text": reply,
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        msg = str(e)
        print(f"Chat Processing Error: {msg}")
        if msg.startswith("RATE_LIMITED"):
            raise HTTPException(status_code=429, detail=msg.replace("RATE_LIMITED: ", ""))
        raise HTTPException(status_code=500, detail=msg)
    except Exception as e:
        print(f"Chat Processing Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web:app", host="0.0.0.0", port=8000, reload=True)