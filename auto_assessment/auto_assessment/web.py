import io
import os
from typing import Optional, List
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

# Import the assessment agent
from agent import RubricAssessmentAgent

app = FastAPI(title="Multi-Agent Assessment API")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

assessment_system = RubricAssessmentAgent()


# =====================================================================
# API ENDPOINTS
# =====================================================================

@app.post("/api/assess")
async def assess_submission(request: Request):
    """
    Dynamically parses uploaded form files and text regardless of the field names 
    sent by the frontend UI.
    """
    try:
        form = await request.form()
        
        # Extract text inputs safely
        qp_text = str(form.get("question_paper_text") or form.get("question_paper") or form.get("rubric_text") or form.get("rubric") or "")
        rubric_text = str(form.get("rubric_text") or form.get("rubric") or "")
        student_text = str(form.get("student_answer_text") or form.get("student_text") or form.get("student_answer") or "")
        custom_instructions = str(form.get("custom_instructions") or form.get("instructions") or "")

        qp_images: List[Image.Image] = []
        student_images: List[Image.Image] = []

        # Iterate over all uploaded files in the form payload
        for key in form.keys():
            form_fields = form.getlist(key) if hasattr(form, "getlist") else [form[key]]
            for val in form_fields:
                if hasattr(val, "filename") and val.filename:
                    content = await val.read()
                    if not content:
                        continue
                    try:
                        img = Image.open(io.BytesIO(content))
                        key_lower = key.lower()
                        fname_lower = val.filename.lower()

                        # Categorize images by field key or filename
                        if any(k in key_lower or k in fname_lower for k in ["ques", "qp", "paper", "rubric", "1"]):
                            qp_images.append(img)
                        elif any(k in key_lower or k in fname_lower for k in ["sol", "ans", "student", "sheet", "2"]):
                            student_images.append(img)
                        else:
                            # Fallback classification
                            if not qp_images:
                                qp_images.append(img)
                            else:
                                student_images.append(img)
                    except Exception as img_err:
                        print(f"⚠️ Could not load image file '{val.filename}': {img_err}")

        print(f"📸 Loaded {len(qp_images)} Question Paper image(s) & {len(student_images)} Student Solution image(s).")

        # Execute multi-agent grading pipeline
        report = assessment_system.process_submission(
            question_paper_text=qp_text,
            rubric_text=rubric_text,
            student_answer_text=student_text,
            qp_images=qp_images,
            student_images=student_images,
            custom_instructions=custom_instructions
        )

        return report.model_dump()

    except Exception as e:
        print(f"❌ Assessment Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat_with_agent(request: Request):
    """
    Universally extracts chat query text regardless of JSON key formatting 
    (supports message, user_message, text, query, prompt, content).
    """
    try:
        try:
            body = await request.json()
        except Exception:
            body = {}

        # Scan for common chat input keys sent by various frontends
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
            raise HTTPException(status_code=400, detail="No message body provided in chat payload.")

        reply = assessment_system.verify_and_chat(user_msg)
        
        # Return response under multiple standard JSON keys
        return {
            "response": reply,
            "reply": reply,
            "message": reply,
            "text": reply
        }

    except HTTPException as http_ex:
        raise http_ex
    except Exception as e:
        print(f"❌ Chat Processing Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("web:app", host="0.0.0.0", port=8000, reload=True)