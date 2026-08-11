import os
import json
import base64
import io
import re
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from groq import Groq
from PIL import Image
import instructor


# =====================================================================
# 1. PYDANTIC SCHEMAS (DATA CONTRACTS)
# =====================================================================

class CriterionScore(BaseModel):
    description: str = Field(description="Description of the rubric criterion evaluated")
    score: float = Field(description="Points awarded for this criterion")
    weight: float = Field(description="Maximum allocated points for this criterion")
    feedback: Optional[str] = Field(default="", description="Specific evaluation notes")


class QuestionEvaluation(BaseModel):
    question_id: str = Field(description="Question ID or number (e.g. 'Problem 1', 'Q2')")
    score: float = Field(description="Total score awarded for this question")
    max_score: float = Field(description="Maximum total score possible for this question")
    criterion_scores: List[CriterionScore] = Field(default=[], description="Breakdown of individual criteria")
    feedback: str = Field(description="Detailed grading feedback and step-by-step evaluation")


class AssessmentReport(BaseModel):
    evaluations: List[QuestionEvaluation] = Field(description="List of evaluated questions")
    overall_summary: str = Field(description="Overall summary of the student submission")


# =====================================================================
# UTILITY & SANITIZATION HELPERS
# =====================================================================

def pil_to_base64(img: Image.Image) -> str:
    """Converts a PIL Image object to a base64 JPEG string for Groq Vision."""
    buffered = io.BytesIO()
    img.convert("RGB").save(buffered, format="JPEG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def clean_input_text(text: str) -> str:
    """
    Sanitizes prompt input:
    1. Replaces single backslashes in LaTeX with double backslashes.
    2. Removes excessive repeated identical lines to break LLM hallucination loops.
    """
    if not text:
        return ""

    # Double-escape backslashes for valid JSON string parsing
    sanitized = re.sub(r'(?<!\\)\\(?!\\)', r'\\\\', text)

    # Deduplicate consecutive identical lines (prevents infinite repetition loops)
    lines = sanitized.splitlines()
    deduped_lines = []
    prev_line = None
    repeat_count = 0

    for line in lines:
        stripped = line.strip()
        if stripped == prev_line and stripped != "":
            repeat_count += 1
            if repeat_count < 3:  # Allow up to 2 identical consecutive lines
                deduped_lines.append(line)
        else:
            prev_line = stripped
            repeat_count = 0
            deduped_lines.append(line)

    return "\n".join(deduped_lines)


# =====================================================================
# 2. SPECIALIZED LLM AGENTS
# =====================================================================

class TranscriberAgent:
    """Agent 1: Converts handwritten sheets into clean text."""
    def __init__(self, raw_client: Groq):
        self.client = raw_client

    def run(self, images: List[Image.Image]) -> str:
        if not images:
            return ""

        print("🤖 [Agent 1: Transcriber] Transcribing handwritten images...")
        user_content = [
            {
                "type": "text", 
                "text": "Transcribe all handwritten equations, math proofs, and text verbatim into clean Markdown. Do not repeat text or loop infinitely."
            }
        ]
        
        for img in images[:5]:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{pil_to_base64(img)}"}
            })

        # Updated to active Groq Vision model
        response = self.client.chat.completions.create(
            model="qwen/qwen3.6-27b",
            messages=[{"role": "user", "content": user_content}],
            temperature=0.0,
            max_tokens=2048
        )
        return response.choices[0].message.content or ""


class AnswerKeyAgent:
    """Agent 2: Generates a step-by-step master reference solution."""
    def __init__(self, raw_client: Groq):
        self.client = raw_client

    def run(self, question_paper: str, rubric: str) -> str:
        print("🤖 [Agent 2: Solver] Generating master answer key...")
        system_prompt = (
            "You are a master educator. Solve the question paper step-by-step. "
            "Keep math clear, concise, and accurate."
        )
        user_prompt = f"=== QUESTION PAPER ===\n{question_paper}\n\n=== RUBRIC ===\n{rubric}"

        response = self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.1,
            max_tokens=2048
        )
        return response.choices[0].message.content or ""


class EvaluatorAgent:
    """Agent 3: Compares student work against the answer key and rubric."""
    def __init__(self, instructor_client: instructor.Instructor):
        self.client = instructor_client

    def run(self, question_paper: str, rubric: str, answer_key: str, student_work: str) -> AssessmentReport:
        print("🤖 [Agent 3: Evaluator] Grading student submission...")
        
        system_instruction = (
            "You are an academic evaluator. Output ONLY valid JSON according to the schema.\n"
            "STRICT FORMATTING RULES:\n"
            "1. DO NOT output any introductory text, preambles, or conversational statements before or after the JSON payload. Start immediately with '{'.\n"
            "2. Keep feedback concise and direct to stay within token limits.\n"
            "3. Do NOT quote full question texts inside feedback fields.\n"
            "4. NEVER use single raw backslashes (use plain text like 'alpha' or double backslashes '\\\\alpha')."
        )

        user_prompt = f"""
=== QUESTION PAPER ===
{clean_input_text(question_paper)}

=== RUBRIC ===
{clean_input_text(rubric)}

=== MASTER ANSWER KEY ===
{clean_input_text(answer_key)}

=== STUDENT SUBMISSION ===
{clean_input_text(student_work) if student_work.strip() else "NO STUDENT SUBMISSION PROVIDED. Grade all questions as 0."}
"""

        return self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_model=AssessmentReport,
            max_retries=3,
            max_tokens=8192,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0
        )


class AuditAgent:
    """Agent 4: Verifies score arithmetic and feedback formatting."""
    def __init__(self, instructor_client: instructor.Instructor):
        self.client = instructor_client

    def run(self, initial_report: AssessmentReport, rubric: str) -> AssessmentReport:
        print("🤖 [Agent 4: Auditor] Auditing scores and feedback...")

        system_instruction = (
            "You are a Quality Audit Agent. Output ONLY valid JSON according to the schema.\n"
            "STRICT FORMATTING RULES:\n"
            "1. DO NOT output any preamble or commentary outside the JSON payload. Your output MUST start with '{'.\n"
            "2. Ensure question scores match the sum of their criterion scores.\n"
            "3. Keep feedback clear, direct, and free of invalid backslashes."
        )

        user_prompt = f"""
=== ORIGINAL RUBRIC ===
{clean_input_text(rubric)}

=== INITIAL REPORT FOR REVIEW ===
{initial_report.model_dump_json(indent=2)}
"""

        return self.client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_model=AssessmentReport,
            max_retries=3,
            max_tokens=8192,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.0
        )


# =====================================================================
# 3. PIPELINE ORCHESTRATOR
# =====================================================================

class MultiAgentAssessmentSystem:
    def __init__(self, api_key: Optional[str] = None):
        key = api_key or os.getenv("GROQ_API_KEY")
        if not key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        self.raw_client = Groq(api_key=key)
        self.instructor_client = instructor.from_groq(self.raw_client, mode=instructor.Mode.JSON)

        self.transcriber = TranscriberAgent(self.raw_client)
        self.solver = AnswerKeyAgent(self.raw_client)
        self.evaluator = EvaluatorAgent(self.instructor_client)
        self.auditor = AuditAgent(self.instructor_client)

        self.conversation_history: List[dict] = []

    def process_submission(
        self,
        question_paper: str = "",
        rubric: str = "",
        student_text: str = "",
        images: Optional[List[Image.Image]] = None,
        # Keyword aliases to support legacy web callers
        question_paper_text: Optional[str] = None,
        rubric_text: Optional[str] = None,
        student_answer_text: Optional[str] = None,
        **kwargs: Any
    ) -> AssessmentReport:
        """Executes the multi-agent assessment pipeline with support for flexible param names."""
        
        # Unify keyword arguments
        final_qp = question_paper_text if question_paper_text is not None else question_paper
        final_rubric = rubric_text if rubric_text is not None else rubric
        final_student = student_answer_text if student_answer_text is not None else student_text

        # Step 1: Transcribe handwritten image pages (if provided)
        transcribed_text = ""
        if images:
            transcribed_text = self.transcriber.run(images)

        combined_student_work = final_student.strip()
        if transcribed_text:
            combined_student_work += f"\n\n=== TRANSCRIBED HANDWRITTEN PAGES ===\n{transcribed_text}"

        # Step 2: Generate Answer Key
        master_answer_key = self.solver.run(final_qp, final_rubric)

        # Step 3: Initial Evaluation
        initial_report = self.evaluator.run(
            question_paper=final_qp,
            rubric=final_rubric,
            answer_key=master_answer_key,
            student_work=combined_student_work
        )

        # Step 4: Audit and final JSON check
        final_report = self.auditor.run(
            initial_report=initial_report,
            rubric=final_rubric
        )

        # Seed chat conversation history
        self.conversation_history = [
            {"role": "system", "content": "You are a helpful academic grading assistant."},
            {"role": "user", "content": f"Evaluation context:\n{final_report.model_dump_json(indent=2)}"},
            {"role": "assistant", "content": "I have evaluated the submission. How can I help you with the grades?"}
        ]

        print("✨ Multi-Agent Evaluation Complete!")
        return final_report

    # Direct method alias for web compatibility
    evaluate_submission = process_submission

    def verify_and_chat(self, user_message: str) -> str:
        """Interactive follow-up conversation about grades."""
        if not self.conversation_history:
            self.conversation_history = [
                {"role": "system", "content": "You are a helpful academic grading assistant."}
            ]

        self.conversation_history.append({"role": "user", "content": user_message})

        try:
            response = self.raw_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=self.conversation_history,
                temperature=0.2,
                max_tokens=2048
            )

            reply = response.choices[0].message.content or ""
            self.conversation_history.append({"role": "assistant", "content": reply})
            return reply

        except Exception as e:
            raise RuntimeError(f"Groq Chat failed: {str(e)}")


# =====================================================================
# 4. BACKWARD COMPATIBILITY CLASS FOR WEB.PY
# =====================================================================

class RubricAssessmentAgent(MultiAgentAssessmentSystem):
    """Direct alias wrapper ensuring imports in legacy web.py work cleanly."""
    pass


# =====================================================================
# 5. LOCAL TEST EXECUTION
# =====================================================================

if __name__ == "__main__":
    system = RubricAssessmentAgent()

    qp = "Problem 1: Solve for x: 2x + 4 = 10."
    rubric = "Problem 1: Max Score 5 pts (3 pts for subtracting 4, 2 pts for dividing by 2)."
    student = "Problem 1: 2x = 6, x = 3."

    report = system.evaluate_submission(
        question_paper_text=qp,
        rubric_text=rubric,
        student_answer_text=student
    )

    print("\n--- TEST OUTPUT ---")
    print(json.dumps(report.model_dump(), indent=2))