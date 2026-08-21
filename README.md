# Auto-Assessment Agent

A multi-agent, evidence-anchored rubric grading system for evaluating handwritten and typed student answer sheets against question papers, rubrics, and optional official model answers.

The system processes academic documents end-to-end: it transcribes handwritten or scanned work, generates a reference solution when required, evaluates answers criterion by criterion, extracts supporting evidence from the student's submission, validates score arithmetic deterministically in Python, and provides structured regrading and assessment-grounded follow-up chat.

Supported document formats include PDFs, images, plain text, and DOCX documents.

<video src="https://github.com/user-attachments/assets/af0ab536-f000-4899-8e4f-44b010bf782e" controls="controls" width="100%">
</video>

---

## How It Works

The assessment workflow is implemented as a set of specialized agents with explicit responsibilities and strict Pydantic data contracts.

```text
Question Paper / Rubric
          │
          ▼
     Transcriber
          │
          ▼
        Solver
  (only if required)
          │
          ▼
 Official / Generated
    Reference Answer
          │
          ▼
 Student Submission
          │
          ▼
      Evaluator
          │
          ▼
        Auditor
          │
          ▼
 Structured Assessment
      │             │
      ▼             ▼
   Regrade       Agent Chat
```

| Agent / Stage | Role | Default Execution |
|---|---|---|
| **Transcriber** | Converts handwritten/scanned PDFs and images into structured academic text while preserving questions, mathematical notation, tables, and page structure | `gemini-3.5-flash-lite` |
| **Solver** | Generates a step-by-step reference answer when an official model answer is not supplied | `gemini-3.5-flash-lite` |
| **Evaluator** | Performs evidence-anchored rubric grading and produces structured criterion-level feedback | `gemini-3.5-flash-lite` |
| **Auditor** | Deterministically validates score bounds, criterion totals, and arithmetic invariants | Python |
| **Regrade Agent** | Re-evaluates explicit grading disputes and verifies supporting evidence against the stored submission | `gemini-3.5-flash-lite` |
| **Chat Agent** | Answers follow-up questions using the completed assessment as context | `gemini-3.5-flash-lite` |

The default model names are defined in `agent.py` and can be overridden through environment variables.

The active runtime configuration is also available from:

```text
GET /api/models
```

The frontend **Models** page reads this endpoint directly, so model metadata does not need to be duplicated or hard-coded in React.

---

## Assessment Pipeline

The core single-submission workflow is:

```text
Upload documents
      │
      ▼
Parse / validate files
      │
      ▼
Transcribe PDFs/images if required
      │
      ▼
Use official model answer
        OR
Generate reference solution
      │
      ▼
Evidence-grounded evaluation
      │
      ▼
Deterministic score audit
      │
      ▼
Persist assessment
      │
      ├── Score Feed
      ├── Re-evaluation
      ├── Agent Chat
      └── History
```

### Official Model Answer

An official answer key can be provided either as uploaded content or pasted text.

When an official model answer is available, the Solver stage is bypassed:

```text
Official Model Answer
        │
        ▼
      Evaluator
```

When no official answer key is supplied:

```text
Question Paper + Rubric
        │
        ▼
      Solver
        │
        ▼
Generated Reference Answer
```

This reduces unnecessary model calls and allows grading to follow instructor-provided ground truth when available.

---

## Evidence-Anchored Grading

The Evaluator does not return only a final score.

Each question can include:

- question-level score
- maximum score
- criterion-level marks
- criterion weights
- short verbatim evidence quotes from the student's work
- specific diagnostic feedback
- the concept being tested
- an actionable rule for the student's next attempt
- a `needs_human_review` flag when the submitted evidence is ambiguous

Example structured output:

```json
{
  "question_id": "Question 1",
  "score": 4,
  "max_score": 5,
  "concept_tested": "Linear equations",
  "criterion_scores": [
    {
      "description": "Correct algebraic manipulation",
      "score": 2,
      "weight": 2,
      "evidence_quote": "2x = 12",
      "feedback": "The equation was rearranged correctly."
    }
  ],
  "feedback": "The main method was correct, but the final isolation step was omitted.",
  "actionable_takeaway": "Always write the final isolated value before ending the solution.",
  "needs_human_review": false
}
```

---

## Deterministic Auditing

The system does not rely exclusively on another LLM call to verify scoring consistency.

The Python `AuditAgent` checks invariants such as:

```text
0 ≤ criterion score ≤ criterion weight
0 ≤ question score ≤ question maximum
criterion totals are internally consistent
question identifiers are structurally valid
```

This provides a deterministic guardrail after model-based evaluation.

---

## Regrading

Students can request re-evaluation of a specific question.

A regrade request can contain:

- question ID
- disputed rubric criterion
- claimed grading mistake
- exact supporting quote from the student's submission

The Regrade Agent checks the claim against the stored assessment context before accepting a score change.

A failed or unsupported claim leaves the original grade unchanged.

---

## Agent Chat

The assessment chat provides follow-up explanations after grading.

Example questions include:

```text
Why did Question 1 lose marks?

Which question was my weakest?

What concept should I revise first?

What should I have written to receive full marks?
```

The Chat Agent is grounded in the saved assessment context:

```text
Question Paper
Rubric
Reference Answer
Student Submission
Assessment Report
```

Chat is explanatory only.

Actual score changes must go through the structured **Request re-evaluation** workflow.

---

## Repository Structure

```text
da7016_project/
│
├── auto_assessment/
│   │
│   ├── auto_assessment/
│   │   ├── agent.py
│   │   │   # Multi-agent assessment pipeline
│   │   │
│   │   ├── web.py
│   │   │   # FastAPI backend and persistence layer
│   │   │
│   │   ├── document_parser.py
│   │   │   # PDF, image, text, and DOCX validation/parsing
│   │   │
│   │   └── __init__.py
│   │
│   └── frontend/
│       │
│       ├── src/
│       │   ├── App.jsx
│       │   └── styles.css
│       │
│       ├── index.html
│       ├── package.json
│       └── vite.config.js
│
├── images/
├── requirements.txt
├── LICENSE
└── README.md
```

Runtime-generated files such as SQLite databases, Python caches, virtual environments, `node_modules`, and build artifacts should not be committed to the repository.

---

## Frontend

The React frontend is a responsive single-page application with five primary views.

### Upload

Upload the material required for grading:

- rubric / question paper
- student answer sheet
- optional official model answer
- optional custom grading instructions

Supported formats include:

```text
PDF
PNG
JPG / JPEG
WEBP
TXT
DOCX
```

### Score Feed

Displays:

- total score
- normalized average score
- number of questions graded
- perfect-score count
- conceptual strengths
- priority growth areas
- per-question feedback
- concept tags
- criterion-level marks
- evidence quotes
- next-time actionable rules

Each question also exposes the structured re-evaluation workflow.

### Agent Chat

Provides assessment-grounded follow-up tutoring.

The chat cannot directly modify grades.

### History

Previously persisted assessments can be reopened using their assessment IDs without re-uploading the original documents.

### Models

Displays the active runtime architecture:

- Transcriber
- Solver
- Evaluator
- Auditor
- Regrade Agent
- Chat Agent

Model information is fetched from:

```text
GET /api/models
```

rather than being hard-coded in the frontend.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/aayushmanda/da7016_project.git
cd da7016_project
```

### 2. Create a virtual environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

On Windows:

```bash
.venv\Scripts\activate
```

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

DOCX parsing requires `python-docx`.

If it is not already included in `requirements.txt`:

```bash
pip install python-docx
```

### 4. Configure Gemini

The following environment variable is required:

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

The default runtime models are:

```bash
GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-flash-lite
GEMINI_GRADING_MODEL=gemini-3.5-flash-lite
GEMINI_CHAT_MODEL=gemini-3.5-flash-lite
```

They can be overridden:

```bash
export GEMINI_TRANSCRIPTION_MODEL="gemini-3.5-flash-lite"
export GEMINI_GRADING_MODEL="gemini-3.5-flash-lite"
export GEMINI_CHAT_MODEL="gemini-3.5-flash-lite"
```

The application reads these settings at startup.

Native PDF processing is performed through Gemini multimodal input, avoiding local PDF-rendering dependencies such as Poppler.

---

## Running the Application

### 1. Start the FastAPI backend

```bash
cd ~/da7016_project/auto_assessment/auto_assessment

export GEMINI_API_KEY="your-key"
export BATCH_CONCURRENCY=3
export MAX_BATCH_SIZE=25

uvicorn web:app --host 0.0.0.0 --port 8000 --reload
```

The backend will normally be available at:

```text
http://127.0.0.1:8000
```

FastAPI's interactive API documentation is available at:

```text
http://127.0.0.1:8000/docs
```

### 2. Start the React frontend

Open another terminal:

```bash
cd auto_assessment/frontend

npm install
npm run dev
```

Vite normally serves the application at:

```text
http://localhost:5173
```

Requests beginning with `/api` are proxied to the FastAPI backend during development.

---

## API

### Inspect Active Pipeline Models

```http
GET /api/models
```

Example:

```json
{
  "agents": [
    {
      "agent": "Transcriber",
      "role": "Multimodal Document Transcription",
      "model": "gemini-3.5-flash-lite",
      "type": "Vision"
    },
    {
      "agent": "Solver",
      "role": "Reference Answer Generation",
      "model": "gemini-3.5-flash-lite",
      "type": "Reasoning"
    },
    {
      "agent": "Evaluator",
      "role": "Evidence-Anchored Rubric Grading",
      "model": "gemini-3.5-flash-lite",
      "type": "Structured Output"
    },
    {
      "agent": "Auditor",
      "role": "Deterministic Score Validation",
      "model": "Python",
      "type": "Deterministic Guardrail"
    }
  ]
}
```

---

### Evaluate a Submission

```http
POST /api/assess
```

Alias:

```http
POST /evaluate
```

Example:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "rubric_file=@examples/rubric.pdf" \
  -F "answer_file=@examples/student_answer.pdf"
```

With an official model answer supplied as text:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "rubric_file=@examples/rubric.pdf" \
  -F "answer_file=@examples/student_answer.pdf" \
  -F "model_answer_text=Problem 1: 2x = 12, therefore x = 6."
```

With custom grading instructions:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "rubric_file=@examples/rubric.pdf" \
  -F "answer_file=@examples/student_answer.pdf" \
  -F "instructions=Be lenient on spelling but strict on mathematical reasoning."
```

---

### Assessment History

List recent assessments:

```http
GET /api/assessments/recent
```

Retrieve one assessment:

```http
GET /api/assessments/{assessment_id}
```

---

### Submit a Regrade Request

```http
POST /api/regrade
```

Example:

```bash
curl -X POST "http://127.0.0.1:8000/api/regrade" \
  -H "Content-Type: application/json" \
  -d '{
    "assessment_id": "YOUR_ASSESSMENT_UUID",
    "question_id": "Question 1",
    "claimed_mistake": "You stated that I did not show 2x = 12, but that step appears in my solution.",
    "disputed_criterion": "Isolate variable",
    "evidence_quote": "2x = 12"
  }'
```

The system verifies the evidence against the stored student submission before applying any score change.

---

### Contextual Chat

```http
POST /api/chat
```

Alias:

```http
POST /chat
```

Example:

```bash
curl -X POST "http://127.0.0.1:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "assessment_id": "YOUR_ASSESSMENT_UUID",
    "messages": [
      {
        "role": "user",
        "content": "Why did Question 1 lose points?"
      }
    ]
  }'
```

---

## Key Design and Reliability Features

### Model Answer Bypass

When an instructor supplies an official model answer, the system uses that answer as the reference rather than generating a new solution.

This provides:

- closer alignment with instructor expectations
- reduced inference cost
- fewer unnecessary model calls

### Structured Pydantic Contracts

Grading results are validated against explicit Pydantic schemas rather than being returned as unrestricted text.

This makes the outputs easier to:

- validate
- persist
- render in the frontend
- re-evaluate
- audit programmatically

### Deterministic Invariant Auditing

The Python Auditor verifies score arithmetic independently of the grading model.

### Evidence Anchoring

Criterion-level assessments can include exact supporting excerpts from the student's submitted work.

### Evidence-Based Regrading

Regrade requests are designed around falsifiable claims rather than generic prompts such as:

```text
Please give me more marks.
```

The student must identify an alleged grading mistake and may provide an exact supporting quote.

### Explicit Uncertainty

Unreadable or ambiguous answers can be marked:

```text
needs_human_review = true
```

instead of requiring the model to invent a confident interpretation.

### Persistent Assessments

Completed assessments are persisted in SQLite and receive unique UUIDs.

An assessment ID is subsequently used by:

- History
- Regrade
- Agent Chat

Persistence allows previous assessments to be reopened without rerunning the complete grading pipeline.

---

## Current Development Status

The single-student assessment pipeline, score feed, history, structured regrading, assessment-grounded chat, and runtime model inspection form the core application.

The project is continuing to improve in areas including:

- batch grading of multiple submissions against shared assessment material
- stronger request-level state isolation for simultaneous users
- upload-role handling for question papers, rubrics, model answers, and student submissions
- expanded document parsing and validation
- deployment and repository hygiene

These areas should not be interpreted as production guarantees until their corresponding implementations are complete.

---

## Design Principles

The system is built around five primary principles:

1. **Evidence before assertion**  
   Grading decisions should be tied to observable student work.

2. **Separate responsibilities**  
   Transcription, solution generation, evaluation, auditing, regrading, and tutoring are separate operations.

3. **Use deterministic computation where possible**  
   Score arithmetic does not require another language-model judgment.

4. **Represent uncertainty explicitly**  
   Ambiguous handwriting or missing evidence should trigger human review rather than fabricated certainty.

5. **Make feedback actionable**  
   Feedback should explain not only what was wrong, but what the student should do differently next time.

---

## Tech Stack

### Backend

- Python
- FastAPI
- Pydantic
- Google Gen AI SDK
- SQLite
- Pillow
- `python-docx`

### Frontend

- React
- Vite
- React Markdown
- responsive CSS

### AI Pipeline

- Gemini multimodal transcription
- Gemini reference-answer generation
- structured Gemini grading
- deterministic Python auditing
- evidence-based Gemini regrading
- assessment-grounded Gemini chat

---

## License

See [LICENSE](LICENSE).

---

## Project Status

Auto-Assessment is an academic multi-agent assessment system under active development.

The core workflow is:

```text
Documents
    ↓
Transcription
    ↓
Reference Solution
    ↓
Rubric Evaluation
    ↓
Deterministic Audit
    ↓
Structured Feedback
    ↓
Regrade / Chat / History
```

For the exact model configuration used by a running instance, query:

```text
GET /api/models
```

rather than relying on duplicated model names in the frontend or documentation.