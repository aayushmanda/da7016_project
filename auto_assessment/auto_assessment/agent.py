import os
import json
import base64
import io
import re
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from groq import Groq, RateLimitError, APIStatusError
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


class RegradeRequest(BaseModel):
    """
    Structured dispute context for a re-evaluation request. Forces the
    requester to name a specific, checkable claim rather than a vague
    "please regrade" -- the evaluator verifies THIS claim against evidence,
    it does not just re-roll the score.
    """
    disputed_criterion: Optional[str] = Field(
        default=None,
        description="The specific rubric criterion being disputed, if any (e.g. 'Correct use of chain rule'). Omit if disputing the whole question."
    )
    claimed_mistake: str = Field(
        description="What the requester believes the grader got wrong (e.g. 'You said I did not show the chain rule, but I did')."
    )
    evidence_quote: Optional[str] = Field(
        default=None,
        description="The exact part of the student's own answer that supports the claim."
    )


class RegradeResult(BaseModel):
    """Structured output for a single-question re-evaluation request."""
    question: QuestionEvaluation
    changed: bool = Field(description="True if the score changed from the original")
    claim_verified: bool = Field(description="True if the specific claimed mistake was found to be a real grading error")
    explanation: str = Field(description="Plain-language explanation that directly addresses whether the claimed mistake was real, and why")


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
    1. Escapes single backslashes so downstream JSON parsing doesn't choke on
       raw LaTeX-style sequences (e.g. \alpha -> \\alpha).
    2. Collapses excessive repeated identical lines to break LLM hallucination loops.
    """
    if not text:
        return ""

    sanitized = re.sub(r'(?<!\\)\\(?!\\)', r'\\\\', text)

    lines = sanitized.split("\n")
    deduped: List[str] = []
    repeat_count = 0
    for line in lines:
        if deduped and line == deduped[-1]:
            repeat_count += 1
            if repeat_count >= 2:
                continue
        else:
            repeat_count = 0
        deduped.append(line)

    return "\n".join(deduped)


def summarize_report(report: "AssessmentReport") -> str:
    """
    Compact plain-text summary of a graded report, used to seed chat context.
    Deliberately NOT the full model_dump_json(indent=2) -- that was resending
    the entire pretty-printed report on every single chat turn and was the
    main driver of hitting the Groq daily token quota (100k TPD).
    """
    lines = [f"Overall summary: {report.overall_summary}", ""]
    for ev in report.evaluations:
        lines.append(f"- {ev.question_id}: {ev.score}/{ev.max_score} -- {ev.feedback}")
    return "\n".join(lines)


# =====================================================================
# 2. AGENT DEFINITIONS
# =====================================================================

class TranscriberAgent:
    """Agent 1: Transcribes handwritten/scanned images into clean text."""

    def __init__(self, raw_client: Groq):
        self.client = raw_client

    def run(self, images: Optional[List[Image.Image]]) -> str:
        if not images:
            print("[Agent 1: Transcriber] No images provided, skipping.")
            return ""

        print(f"[Agent 1: Transcriber] Transcribing {len(images)} image(s)...")
        user_content: List[dict] = [
            {
                "type": "text",
                "text": (
                    "Transcribe all handwritten equations, math proofs, and text verbatim "
                    "into clean Markdown. Do not repeat text or loop infinitely."
                ),
            }
        ]
        for img in images[:5]:
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{pil_to_base64(img)}"},
            })

        try:
            response = self.client.chat.completions.create(
                model="qwen/qwen3.6-27b",
                messages=[{"role": "user", "content": user_content}],
                temperature=0.0,
                max_tokens=2048,
            )
            text = response.choices[0].message.content or ""
            print(f"[Agent 1: Transcriber] Got {len(text)} chars back. Preview: {text[:200]!r}")
            return text
        except Exception as e:
            print(f"[Agent 1: Transcriber] FAILED: {type(e).__name__}: {e}")
            return ""


class AnswerKeyAgent:
    """Agent 2: Generates a step-by-step master reference solution."""

    def __init__(self, raw_client: Groq):
        self.client = raw_client

    def run(self, question_paper: str, rubric: str) -> str:
        print(f"[Agent 2: Solver] Generating master answer key... "
              f"(QP chars={len(question_paper)}, Rubric chars={len(rubric)})")
        if not question_paper.strip():
            print("[Agent 2: Solver] WARNING: question_paper is EMPTY -- answer key will be low quality.")

        system_prompt = (
            "You are a master educator. Solve the question paper step-by-step. "
            "Keep math clear, concise, and accurate."
        )
        user_prompt = f"=== QUESTION PAPER ===\n{question_paper}\n\n=== RUBRIC ===\n{rubric}"

        try:
            response = self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=2048,
            )
            text = response.choices[0].message.content or ""
            print(f"[Agent 2: Solver] Answer key preview: {text[:200]!r}")
            return text
        except Exception as e:
            print(f"[Agent 2: Solver] FAILED: {type(e).__name__}: {e}")
            raise


class EvaluatorAgent:
    """Agent 3: Compares student work against the answer key and rubric."""

    def __init__(self, instructor_client: instructor.Instructor):
        self.client = instructor_client

    def run(self, question_paper: str, rubric: str, answer_key: str, student_work: str) -> AssessmentReport:
        print(f"[Agent 3: Evaluator] Grading student submission... "
              f"(QP={len(question_paper)} chars, Rubric={len(rubric)} chars, "
              f"AnswerKey={len(answer_key)} chars, StudentWork={len(student_work)} chars)")
        if not student_work.strip():
            print("[Agent 3: Evaluator] WARNING: student_work is EMPTY -- every question will be graded 0.")

        system_instruction = (
            "You are an academic evaluator. Output ONLY valid JSON according to the schema.\n"
            "STRICT FORMATTING RULES:\n"
            "1. DO NOT output any introductory text, preambles, or conversational statements before or after the JSON payload. Start immediately with '{'.\n"
            "2. Keep feedback concise and direct to stay within token limits.\n"
            "3. Do NOT quote full question texts inside feedback fields.\n"
            "4. NEVER use single raw backslashes (use plain text like 'alpha' or double backslashes '\\alpha')."
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

        try:
            report = self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                response_model=AssessmentReport,
                max_retries=3,
                max_tokens=8192,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
            )
            print(f"[Agent 3: Evaluator] Parsed {len(report.evaluations)} question evaluation(s).")
            for ev in report.evaluations:
                print(f"    - {ev.question_id}: {ev.score}/{ev.max_score} | feedback preview: {ev.feedback[:80]!r}")
            return report
        except Exception as e:
            print(f"[Agent 3: Evaluator] FAILED after retries: {type(e).__name__}: {e}")
            raise


class AuditAgent:
    """Agent 4: Verifies score arithmetic and feedback formatting."""

    def __init__(self, instructor_client: instructor.Instructor):
        self.client = instructor_client

    def run(self, initial_report: AssessmentReport, rubric: str) -> AssessmentReport:
        print("[Agent 4: Auditor] Auditing scores and feedback...")

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

        try:
            report = self.client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                response_model=AssessmentReport,
                max_retries=3,
                max_tokens=8192,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
            )
            print(f"[Agent 4: Auditor] Final report has {len(report.evaluations)} question evaluation(s).")
            return report
        except Exception as e:
            print(f"[Agent 4: Auditor] FAILED: {type(e).__name__}: {e}")
            raise


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
        # Stores question paper / rubric / answer key / student work / report
        # from the most recent process_submission() call -- required so a
        # regrade request can be checked against the SAME evidence as the
        # original grade.
        self.last_context: Optional[dict] = None

    def process_submission(
        self,
        question_paper: str = "",
        rubric: str = "",
        student_text: str = "",
        images: Optional[List[Image.Image]] = None,
        qp_images: Optional[List[Image.Image]] = None,
        student_images: Optional[List[Image.Image]] = None,
        question_paper_text: Optional[str] = None,
        rubric_text: Optional[str] = None,
        student_answer_text: Optional[str] = None,
        custom_instructions: str = "",
        **kwargs: Any,
    ) -> AssessmentReport:
        """Executes the multi-agent assessment pipeline with support for flexible param names."""

        final_qp = question_paper_text if question_paper_text is not None else question_paper
        final_rubric = rubric_text if rubric_text is not None else rubric
        final_student = student_answer_text if student_answer_text is not None else student_text

        all_student_images = list(student_images or []) + list(images or [])
        all_qp_images = list(qp_images or [])

        if all_qp_images:
            qp_transcribed = self.transcriber.run(all_qp_images)
            if qp_transcribed:
                final_qp = f"{final_qp}\n\n=== TRANSCRIBED QUESTION PAPER PAGES ===\n{qp_transcribed}".strip()

        transcribed_text = ""
        if all_student_images:
            transcribed_text = self.transcriber.run(all_student_images)

        combined_student_work = final_student.strip()
        if transcribed_text:
            combined_student_work += f"\n\n=== TRANSCRIBED HANDWRITTEN PAGES ===\n{transcribed_text}"

        if custom_instructions:
            final_rubric = f"{final_rubric}\n\n=== ADDITIONAL GRADER INSTRUCTIONS ===\n{custom_instructions}"

        master_answer_key = self.solver.run(final_qp, final_rubric)

        initial_report = self.evaluator.run(
            question_paper=final_qp,
            rubric=final_rubric,
            answer_key=master_answer_key,
            student_work=combined_student_work,
        )

        final_report = self.auditor.run(
            initial_report=initial_report,
            rubric=final_rubric,
        )

        # Store full context for later regrade requests.
        self.last_context = {
            "question_paper": final_qp,
            "rubric": final_rubric,
            "answer_key": master_answer_key,
            "student_work": combined_student_work,
            "report": final_report,
        }

        # Seed chat with a COMPACT summary, not the full indented JSON dump --
        # that was the main driver of burning through the Groq daily token quota.
        self.conversation_history = [
            {"role": "system", "content": "You are a helpful academic grading assistant."},
            {"role": "user", "content": f"Evaluation context:\n{summarize_report(final_report)}"},
            {"role": "assistant", "content": "I have evaluated the submission. How can I help you with the grades?"},
        ]

        print("Multi-Agent Evaluation Complete!")
        return final_report

    evaluate_submission = process_submission

    def regrade_question(self, question_id: str, dispute: "RegradeRequest") -> RegradeResult:
        """
        Re-evaluates a single question in response to a STRUCTURED dispute
        (not a vague "please regrade"). Requires process_submission() to
        have run first -- uses the stored grading context so the recheck is
        against the same evidence as the original grade.

        The dispute must name a specific claimed mistake (and ideally the
        disputed criterion + a quote from the student's own answer), so the
        evaluator is checking a falsifiable claim rather than just re-rolling
        the score because it was asked nicely.
        """
        if not self.last_context:
            raise RuntimeError("No completed assessment to regrade. Run an assessment first.")

        report: AssessmentReport = self.last_context["report"]
        original = next((ev for ev in report.evaluations if ev.question_id == question_id), None)
        if original is None:
            raise ValueError(f"Question '{question_id}' not found in the last assessment.")

        print(f"[Regrade] Re-evaluating {question_id} -- claimed mistake: {dispute.claimed_mistake!r}")

        # Pull the specific criterion being disputed (if named) so the model
        # can compare the claim directly against what was actually said about it.
        disputed_criterion_block = "None specified -- dispute applies to the whole question."
        if dispute.disputed_criterion:
            match = next(
                (c for c in original.criterion_scores
                 if dispute.disputed_criterion.lower() in c.description.lower()),
                None,
            )
            if match:
                disputed_criterion_block = (
                    f"Criterion: {match.description}\n"
                    f"Original score: {match.score}/{match.weight}\n"
                    f"Original justification: {match.feedback or '(none given)'}"
                )
            else:
                disputed_criterion_block = f"Criterion named by requester (not found verbatim in original grading): {dispute.disputed_criterion}"

        evidence_block = dispute.evidence_quote or "(No specific quote provided by requester.)"

        system_instruction = (
            "You are an academic evaluator performing a RE-EVALUATION of a single question, "
            "auditing a SPECIFIC, NAMED claim of grading error. Output ONLY valid JSON according to the schema.\n"
            "STRICT RULES:\n"
            "1. Your job is to verify or refute the claimed mistake below -- not to generally 're-think' the grade.\n"
            "2. Locate the disputed criterion (if named) and re-read the ORIGINAL justification given for it.\n"
            "3. Check the requester's evidence quote against the actual student submission provided. If the quote "
            "is not genuinely present or does not support the claim, the claim is NOT verified.\n"
            "4. Set claim_verified=true ONLY if the original grading demonstrably missed or misjudged something "
            "specific -- e.g. it said content was absent when the evidence shows it was present, or it misapplied "
            "the rubric criterion's actual wording.\n"
            "5. If claim_verified=true, update the score and criterion breakdown to reflect the correction.\n"
            "6. If claim_verified=false, KEEP the original score exactly. Do not adjust the score just because "
            "the requester disagrees -- only a verified, evidenced mistake changes the outcome.\n"
            "7. explanation must explicitly state whether the claim was verified and cite the evidence you checked."
        )

        user_prompt = f"""
=== QUESTION PAPER ===
{clean_input_text(self.last_context["question_paper"])}

=== RUBRIC ===
{clean_input_text(self.last_context["rubric"])}

=== MASTER ANSWER KEY ===
{clean_input_text(self.last_context["answer_key"])}

=== STUDENT SUBMISSION (full, for verifying evidence quotes) ===
{clean_input_text(self.last_context["student_work"])}

=== ORIGINAL GRADE FOR {question_id} ===
{original.model_dump_json(indent=2)}

=== DISPUTED CRITERION CONTEXT ===
{disputed_criterion_block}

=== REQUESTER'S CLAIMED MISTAKE ===
{clean_input_text(dispute.claimed_mistake)}

=== REQUESTER'S EVIDENCE QUOTE (verify this appears in the submission above) ===
{clean_input_text(evidence_block)}
"""

        try:
            result: RegradeResult = self.instructor_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                response_model=RegradeResult,
                max_retries=3,
                max_tokens=4096,
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.0,
            )
        except Exception as e:
            print(f"[Regrade] FAILED: {type(e).__name__}: {e}")
            raise RuntimeError(f"Re-evaluation failed: {str(e)}")

        # Enforce max_score integrity even if the model drifts.
        result.question.max_score = original.max_score
        result.question.score = min(result.question.score, original.max_score)

        # An unverified claim must not silently change the score -- hard guard
        # in code, not just a prompt instruction, in case the model drifts.
        if not result.claim_verified:
            result.question.score = original.score
            result.question.feedback = original.feedback
            result.question.criterion_scores = original.criterion_scores
            result.changed = False

        # Write the update back into the stored report so subsequent regrades
        # and chat context see the corrected score, not the stale one.
        for idx, ev in enumerate(report.evaluations):
            if ev.question_id == question_id:
                report.evaluations[idx] = result.question
                break

        print(f"[Regrade] {question_id}: {original.score} -> {result.question.score} "
              f"(claim_verified={result.claim_verified}, changed={result.changed})")

        return result

    def verify_and_chat(self, user_message: str) -> str:
        """Interactive follow-up conversation about grades."""
        if not self.conversation_history:
            print("[Chat] WARNING: conversation_history is empty -- assessment probably never completed successfully.")
            self.conversation_history = [
                {"role": "system", "content": "You are a helpful academic grading assistant."}
            ]

        self.conversation_history.append({"role": "user", "content": user_message})

        MAX_TURNS = 8
        system_msgs = [m for m in self.conversation_history if m["role"] == "system"]
        other_msgs = [m for m in self.conversation_history if m["role"] != "system"]
        trimmed_history = system_msgs + other_msgs[-MAX_TURNS:]

        print(f"[Chat] Sending message, history length={len(trimmed_history)} "
              f"(trimmed from {len(self.conversation_history)})")

        try:
            response = self.raw_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=trimmed_history,
                temperature=0.2,
                max_tokens=1024,
            )
            reply = response.choices[0].message.content or ""
            print(f"[Chat] Reply preview: {reply[:150]!r}")
            self.conversation_history.append({"role": "assistant", "content": reply})
            return reply

        except RateLimitError as e:
            print(f"[Chat] Rate limited: {e}")
            raise RuntimeError(
                "RATE_LIMITED: The grading model has hit its daily usage limit on Groq. "
                "Please try again later, or switch to a different model/provider."
            )
        except APIStatusError as e:
            print(f"[Chat] Groq API error: {e}")
            raise RuntimeError(f"Groq Chat failed: {str(e)}")
        except Exception as e:
            print(f"[Chat] FAILED: {type(e).__name__}: {e}")
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
        student_answer_text=student,
    )

    print("\n--- TEST OUTPUT ---")
    print(json.dumps(report.model_dump(), indent=2))