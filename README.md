# Auto-Assessment Agent

# Auto-Assessment Agent

This repository contains a rubric-based assessment engine that grades student answers and produces detailed, rubric-defensible feedback.

## What is included

- `auto_assessment/`: Rubric grading package with CLI and uvicorn API
- `examples/sample_payload.json`: Example payload for rubric grading

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

### Start the frontend-backed API

```bash
uvicorn auto_assessment.web:app --reload
```

Open `http://127.0.0.1:8000/` in your browser to use the web interface.

### API-only access

Send payloads directly to `/assess`:

```bash
curl -X POST "http://127.0.0.1:8000/assess" \
  -H "Content-Type: application/json" \
  -d @examples/sample_payload.json
```

Use `?llm=true` to enable the optional LLM-based grading mode if `OPENAI_API_KEY` is configured.

## Roadmap

1. Add richer rubric structures and more granular partial-credit scoring
2. Improve feedback generation with stronger rubric-based reasoning
3. Add a web UI for submitting answer sheets and reviewing assessment results
