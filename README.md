# Auto-Assessment Agent

This repository contains a rubric-based assessment engine that grades student answers and produces detailed, rubric-defensible feedback.

## What is included

- `auto_assessment/`: Rubric grading package with CLI and uvicorn API

## Frontend
![alt text](<Screenshot 2026-08-11 at 9.37.46 AM.png>) 
![alt text](<Screenshot 2026-08-11 at 9.37.58 AM.png>) 
![alt text](<Screenshot 2026-08-11 at 9.38.07 AM.png>)

## Installation

```bash
pip install -r requirements.txt
```

## Usage

### Run the CLI

```bash
python -m auto_assessment.cli examples/sample_payload.json
```

### Optional LLM grading

Set `OPENAI_API_KEY` in your environment and run:

```bash
python -m auto_assessment.cli examples/sample_payload.json --llm
```

### Start the backend API

```bash
uvicorn auto_assessment.web:app --reload
```

The backend exposes the grading and chat APIs at:

- `POST /api/assess` for assessment payloads and optional file uploads
- `POST /api/chat` for agent chat messages
- `GET /health` for a simple health check

### Run the React frontend

Open a second terminal and run:

```bash
cd frontend
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal. The frontend proxies `/api` to `http://127.0.0.1:8000`.

### API-only access

Send payloads directly to `/api/assess` with a multipart form:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "payload=@examples/sample_payload.json;type=application/json"
```

Upload an image or PDF alongside the payload:

```bash
curl -X POST "http://127.0.0.1:8000/api/assess" \
  -F "payload=@examples/sample_payload.json;type=application/json" \
  -F "file=@/path/to/document.pdf"
```

Send a chat message:

```bash
curl -X POST "http://127.0.0.1:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What did the student miss in this answer?"}]}'
```

Set `OPENAI_API_KEY` in your environment to enable richer LLM grading and chat responses.

## Roadmap

1. Add richer rubric structures and more granular partial-credit scoring
2. Improve feedback generation with stronger rubric-based reasoning
3. Add a web UI for submitting answer sheets and reviewing assessment results
