# Auto-Assessment Agent

A multi-agent grading system that evaluates handwritten and typed student answer sheets against a question paper, rubric, and (optional) model answer — evidence-anchored, criterion-level, with deterministic score auditing.

Handles PDFs, images, plain text, and DOCX. Grades one submission or a whole batch against the same rubric.

<video src="https://github.com/user-attachments/assets/af0ab536-f000-4899-8e4f-44b010bf782e" controls width="100%"></video>

---

## How it works

```text
Question Paper/Rubric ──▶ Transcriber ──▶ Solver (skipped if a model answer was provided)
                                                │
Student Submission ──▶ Transcriber ──▶ Evaluator ──▶ Auditor ──▶ Structured Assessment
                         (+ original pages, for diagram/sketch questions)   │
                                                                   ┌────────┼────────┐
                                                                Regrade  Agent Chat  History
```

| Stage | Role | Runs on |
|---|---|---|
| **Transcriber** | Reads handwritten/scanned PDFs and images into structured text, preserving notation, tables, and page layout | Gemini (vision) |
| **Solver** | Generates a reference solution when no official model answer is supplied | Gemini |
| **Evaluator** | Grades criterion-by-criterion with verbatim evidence quotes; for questions asking for a diagram/sketch/construction, also looks at the original pages directly instead of trusting the transcript alone | Gemini |
| **Auditor** | Checks score bounds and criterion-total arithmetic — no LLM call | Python |
| **Regrade Agent** | Re-checks a specific disputed criterion against the stored evidence before changing a score | Gemini |
| **Chat Agent** | Answers follow-up questions grounded in the saved assessment; favors Socratic guidance over just handing over answers, and stays concise | Gemini |

Model names default to `gemini-3.5-flash-lite` and are overridable via env vars (below). The live configuration is always available at `GET /api/models` — the frontend's **Models** page reads it directly rather than hard-coding it.

---

## Quick start

```bash
git clone https://github.com/aayushmanda/da7016_project.git
cd da7016_project

python3 -m venv .venv
source .venv/bin/activate          # .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Create `.env` in the repo root:

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | yes | grading/transcription/chat |
| `GOOGLE_CLIENT_ID` | yes | Google sign-in |
| `GOOGLE_ALLOWED_DOMAINS` | no | comma-separated email domains allowed to sign in; unset = allow all |
| `BODHAN_API_KEY` | no | enables "listen" (text-to-speech) in Agent Chat |
| `GEMINI_TRANSCRIPTION_MODEL` / `GEMINI_GRADING_MODEL` / `GEMINI_CHAT_MODEL` | no | override the default model per stage |
| `BATCH_CONCURRENCY` | no | concurrent Gemini calls in a batch grading run (default `3`) |
| `MAX_BATCH_SIZE` | no | max students per batch (default `25`) |
| `MAX_IMAGES_PER_REQUEST` | no | max image pages per single upload (default `10`; PDFs are exempt — sent to Gemini natively) |

Run both servers (two terminals):

```bash
# backend
cd auto_assessment/auto_assessment
uvicorn web:app --host 0.0.0.0 --port 8000 --reload

# frontend
cd auto_assessment/frontend
npm install && npm run dev
```

Frontend: `http://localhost:5173` (proxies `/api` to the backend) · Backend docs: `http://127.0.0.1:8000/docs`

Or use `./start.sh` from the repo root to launch both together.

---

## Using the app

- **Upload** — attach a rubric/question paper and one or more answer sheets (multiple files = batch grading); optionally attach a model answer and custom grading instructions.
- **Score Feed** — per-question score, evidence-anchored feedback, "View question" / "View your written answer" per question, and **Request re-evaluation** for disputed grading.
- **Agent Chat** — ask about the grading; concise, Socratic-leaning explanations grounded in the actual assessment. Can't change scores — use Request re-evaluation for that.
- **History** — reopen or delete past assessments without re-uploading. The 5 most recent assessment *runs* are kept per login (a batch counts as one run, not one per student).
- **Models** — live view of which model powers each pipeline stage.

---

## API

| Endpoint | Purpose |
|---|---|
| `GET /api/models` | active model configuration |
| `POST /api/assess` | grade one submission |
| `POST /api/assess/batch` | grade multiple submissions against one shared rubric |
| `GET /api/assessments/recent` | list recent assessments (current session) |
| `GET /api/assessments/{id}` | fetch one assessment |
| `DELETE /api/assessments/{id}` | delete one assessment |
| `POST /api/regrade` | request re-evaluation of a specific question |
| `POST /api/chat` | assessment-grounded chat |
| `POST /api/voice/synthesize` | text-to-speech for chat/feedback (requires `BODHAN_API_KEY`) |

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "rubric_file=@examples/rubric.pdf" \
  -F "answer_file=@examples/student_answer.pdf"
```

```bash
curl -X POST "http://127.0.0.1:8000/api/regrade" \
  -H "Content-Type: application/json" \
  -d '{
    "assessment_id": "YOUR_ASSESSMENT_UUID",
    "question_id": "Question 1",
    "claimed_mistake": "You said I did not show 2x = 12, but it appears in my solution.",
    "evidence_quote": "2x = 12"
  }'
```

---

## Design principles

1. **Evidence before assertion** — every grading decision cites the student's actual work (and, for diagrams, the actual page image).
2. **Separate responsibilities** — transcription, solving, evaluation, auditing, regrading, and chat are distinct steps with their own contracts.
3. **Deterministic where possible** — score arithmetic is checked in Python, not by another LLM call.
4. **Explicit uncertainty** — illegible or ambiguous work sets `needs_human_review`, rather than guessing.
5. **Actionable feedback** — every question gets a concrete "what to do differently next time," not just right/wrong.

---

## Repository structure

```text
da7016_project/
├── auto_assessment/
│   ├── auto_assessment/
│   │   ├── agent.py            # multi-agent pipeline + Pydantic contracts
│   │   ├── web.py              # FastAPI backend + persistence
│   │   └── document_parser.py  # PDF/image/text/DOCX parsing
│   └── frontend/
│       ├── src/App.jsx
│       ├── src/styles.css
│       └── package.json
├── requirements.txt
├── start.sh
└── LICENSE
```

SQLite databases, `.venv`, `node_modules`, and build output are not committed.

---

## Tech stack

**Backend:** Python, FastAPI, Pydantic, Google Gen AI SDK, OpenAI SDK (Bodhan TTS), SQLite, Pillow
**Frontend:** React, Vite, react-markdown + KaTeX (math rendering)

## License

See [LICENSE](LICENSE).
