import os
from typing import List, Any
from pydantic import BaseModel, Field

from langchain_groq import ChatGroq
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage


# ==========================================
# 1. Pydantic Schemas for Structured Output
# ==========================================

class CriterionScore(BaseModel):
    description: str = Field(description="Description of the rubric criterion")
    weight: float = Field(description="Maximum score possible for this specific criterion")
    score: float = Field(description="Score awarded to the student for this criterion")
    feedback: str = Field(description="Feedback on this specific criterion")


class QuestionEvaluation(BaseModel):
    question_id: str = Field(description="Identifier for the question (e.g. 'q1', 'Question 1')")
    score: float = Field(description="Total earned score for this question")
    max_score: float = Field(description="Dynamic maximum score possible for this question based on rubric weights")
    feedback: str = Field(description="Actionable summary feedback for this question")
    criterion_scores: List[CriterionScore] = Field(description="Criteria breakdown")


class AssessmentReport(BaseModel):
    evaluations: List[QuestionEvaluation] = Field(description="List of question assessments")
    overall_summary: str = Field(description="Overall summary of student performance")


# ==========================================
# 2. Rubric Assessment Agent Class (Groq)
# ==========================================

class RubricAssessmentAgent:
    def __init__(self, model_name: str = "llama-3.3-70b-versatile", temperature: float = 0.0):
        # Fetch Groq API Key from environment
        groq_api_key = os.getenv("GROQ_API_KEY")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY environment variable not found. Please set your API key.")

        # Initialize ChatGroq LLM
        self.llm = ChatGroq(
            model_name=model_name,
            temperature=temperature,
            api_key=groq_api_key
        )
        
        # Bind LLM to structured output schema for rubric scoring
        self.structured_evaluator = self.llm.with_structured_output(AssessmentReport)
        
        # Store chat history for verification queries
        self.chat_history: List[Any] = []
        
        # System instructions
        self.system_prompt = (
            "You are an expert AI Grading Agent. Your task is to evaluate student answer sheets "
            "against the provided Question Paper and Rubric.\n\n"
            "Grading Guidelines:\n"
            "1. Calculate scores dynamically based on the weights specified in the rubric criteria.\n"
            "2. Do NOT restrict scores to a scale of 10 unless the rubric explicitly totals 10.\n"
            "3. Set 'max_score' for each question as the sum of its criterion weights.\n"
            "4. Be objective, thorough, and provide actionable feedback for missing or partial points.\n"
            "5. In follow-up chat turns, assist the user in verifying, explaining, or adjusting grades."
        )

    def evaluate_submission(
        self, 
        rubric_text: str, 
        question_paper_text: str, 
        student_answer_text: str
    ) -> AssessmentReport:
        """Reads rubric, question paper, and student answer sheet to evaluate and return structured feedback."""
        
        user_prompt = f"""
Please evaluate the following student submission using the provided question paper and rubric.

--- QUESTION PAPER ---
{question_paper_text}

--- RUBRIC ---
{rubric_text}

--- STUDENT ANSWER SHEET ---
{student_answer_text}
        """

        messages = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=user_prompt)
        ]

        # 1. Run structured assessment using Groq
        report: AssessmentReport = self.structured_evaluator.invoke(messages)

        # 2. Save context into history for verification chat turns
        self.chat_history = [
            SystemMessage(content=self.system_prompt),
            HumanMessage(content=user_prompt),
            AIMessage(content=f"Assessment complete. Overall summary: {report.overall_summary}")
        ]

        return report

    def verify_and_chat(self, user_message: str) -> str:
        """Interactive verification mode to ask questions, clarify reasoning, or adjust feedback."""
        if not self.chat_history:
            return "Please run `evaluate_submission()` first before initiating chat verification."

        self.chat_history.append(HumanMessage(content=user_message))
        
        # Generate conversational response incorporating history
        response = self.llm.invoke(self.chat_history)
        self.chat_history.append(response)
        
        return str(response.content)


# ==========================================
# 3. Execution Example
# ==========================================

if __name__ == "__main__":
    # Ensure GROQ_API_KEY is exported in your environment:
    # export GROQ_API_KEY="your-groq-api-key"

    agent = RubricAssessmentAgent()

    # Define sample question paper, rubric, and student responses
    sample_question_paper = """
    Q1: Explain Supervised vs Unsupervised Learning.
    Q2: Describe a real-world use case for Reinforcement Learning.
    """

    sample_rubric = """
    Question 1 Rubric (Max 15 points):
    - Defines supervised learning (5 pts)
    - Defines unsupervised learning (5 pts)
    - Provides concrete contrasting examples (5 pts)

    Question 2 Rubric (Max 25 points):
    - Identifies a valid real-world domain (10 pts)
    - Explains why RL fits the domain (10 pts)
    - Mentions reward/agent dynamics (5 pts)
    """

    sample_student_answers = """
    Q1: Supervised learning uses labeled data to train models. Unsupervised learning finds patterns in unlabeled data.
    Q2: Autonomous vehicles use RL to learn driving policies by receiving rewards for safe navigation and penalties for crashes.
    """

    print("--- 1. EVALUATING SUBMISSION WITH GROQ ---")
    report = agent.evaluate_submission(
        rubric_text=sample_rubric,
        question_paper_text=sample_question_paper,
        student_answer_text=sample_student_answers
    )

    # Output dynamic scoring report
    print(f"Overall Summary: {report.overall_summary}\n")
    for eval_item in report.evaluations:
        print(f"[{eval_item.question_id}] Score: {eval_item.score} / {eval_item.max_score}")
        print(f"Feedback: {eval_item.feedback}")
        for criterion in eval_item.criterion_scores:
            print(f"  • {criterion.description}: {criterion.score}/{criterion.weight} — {criterion.feedback}")
        print("-" * 50)

    print("\n--- 2. INTERACTIVE CHAT VERIFICATION ---")
    
    # Verification query 1
    query_1 = "Why did the student lose points on Question 1?"
    print(f"\nUser: {query_1}")
    print(f"Agent:\n{agent.verify_and_chat(query_1)}")

    # Verification query 2
    query_2 = "Can we award 2 points partial credit for implicit contrast in Q1?"
    print(f"\nUser: {query_2}")
    print(f"Agent:\n{agent.verify_and_chat(query_2)}")