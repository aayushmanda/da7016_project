# Auto-Assessment Agent

A multi-agent, rubric-based grading system that evaluates student answer sheets against a rubric and produces detailed, question-by-question, rubric-defensible feedback — end-to-end, with no human reviewer in the loop.

Upload a rubric/question paper and a student's answer sheet (PDF, image, or text), and the system transcribes handwritten pages, generates a master answer key, grades each question against its rubric criteria, audits its own scoring for consistency, and lets you follow up with a conversational agent about the results.

## How It Works

The grading pipeline runs as four cooperating agents rather than a single prompt:

| Agent | Role |
|---|---|
| **Transcriber** | Converts handwritten/scanned question paper and answer sheet images into clean Markdown text via a vision model |
| **Solver** | Generates a step-by-step master answer key from the question paper and rubric |
| **Evaluator** | Grades the student's submission against the rubric and answer key, producing structured per-question and per-criterion scores |
| **Auditor** | Reviews the initial grading pass, correcting any score that doesn't total correctly or lacks a clear justification |

Grading runs fully automatically from the inputs provided — there is no manual review step. The bar for output quality is that feedback must be specific and rubric-defensible enough for a student to act on it directly.

## Repository Structure

```
auto_assessment/
├── auto_assessment/
│   ├── agent.py             # Multi-agent pipeline: Transcriber, Solver, Evaluator, Auditor
│   ├── web.py                # FastAPI app exposing /api/assess and /api/chat
│   ├── document_parser.py    # Extracts text + images from PDFs, images, and plain text uploads
│   └── __init__.py
└── frontend/
    ├── src/
    │   ├── App.jsx            # Upload / Score Feed / Agent Chat views
    │   └── styles.css
    ├── index.html
    └── package.json
```

## Frontend

The web UI is a single-page app with three views reachable from a persistent sidebar (a bottom tab bar on mobile):

- **Upload** — attach the rubric/question paper and the student's answer sheet (PDF, image, or text), plus optional custom grading instructions
- **Score Feed** — summary stats (average score, total points, questions graded, full-marks count) followed by a per-question breakdown with rubric criteria, or a raw JSON view for debugging/export
- **Agent Chat** — ask follow-up questions about the grading (e.g. "Why did Q1 lose points?") or request adjustments

![Upload view](<Screenshot 2026-08-11 at 9.37.46 AM.png>)
![Score Feed view](<Screenshot 2026-08-11 at 9.37.58 AM.png>)
![Agent Chat view](<Screenshot 2026-08-11 at 9.38.07 AM.png>)

## Installation

```bash
pip install -r requirements.txt
```

**Required environment variable:**

```bash
export GROQ_API_KEY="your-groq-key"
```

**System dependency for scanned/handwritten PDFs:** PDF-to-image conversion relies on `poppler`, which is not installable via pip alone.

- macOS: `brew install poppler`
- Ubuntu/Debian: `sudo apt-get install poppler-utils`
- Windows: install the poppler binaries and add the `bin` folder to your `PATH`

Without poppler installed, PDFs with no embedded text (i.e. scanned or photographed answer sheets) will yield no text and no images for the transcriber to work with.

## Usage

### Start the backend API

```bash
cd auto_assessment/auto_assessment
uvicorn web:app --host 0.0.0.0 --port 8000 --reload
```

The backend exposes:

- `POST /api/assess` (alias: `/evaluate`) — accepts a multipart form with rubric/question paper and student answer sheet files, returns the graded report
- `POST /api/chat` (alias: `/chat`) — accepts either a flat `{"message": "..."}` or a `{"messages": [...]}` array, returns the agent's reply

### Run the React frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. The frontend proxies `/api` requests to `http://127.0.0.1:8000`.

### API-only access

Upload a rubric/question paper and a student answer sheet directly:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "rubric_file=@examples/rubric.pdf" \
  -F "answer_file=@examples/student_answer.jpg" \
  -F "instructions=Be lenient on spelling, strictly evaluate math steps"
```

Send a chat message about a completed assessment:

```bash
curl -X POST "http://127.0.0.1:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Why did Question 1 lose points?"}]}'
```

## Known Limitations

- Grading and chat currently share Groq's daily token quota on the free tier (100k TPD); heavy chat usage after a large grading run can hit rate limits. Chat context is kept compact and capped to the last 8 turns to reduce this, but sustained use may still exhaust the quota.
- The vision transcription model used for handwritten pages should be verified against your Groq account's available model list — an invalid model ID fails silently (returns empty transcription) rather than raising a visible error, to avoid one bad image derailing the whole grading run.
- Rubric-defensibility is currently checked by a single audit pass (Agent 4). There is no external human-in-the-loop verification step by design.

## Frontend
![alt text](<Screenshot 2026-08-11 at 9.37.46 AM.png>) 
![alt text](<Screenshot 2026-08-11 at 9.37.58 AM.png>)
![alt text](<Screenshot 2026-08-11 at 9.38.07 AM.png>)

## Roadmap

1. Add richer rubric structures with weighted, hierarchical criteria and more granular partial-credit scoring
2. Add a lightweight automated test suite with fixture answer sheets to catch prompt/model regressions before deployment
3. Persist assessment history so past runs can be revisited without re-uploading documents
4. Add per-criterion confidence scoring so low-confidence grades can be flagged for optional human review
