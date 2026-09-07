# Backend image: FastAPI + the multi-agent grading pipeline.
# Build context is the repo root (needs requirements.txt at root and the
# backend package under auto_assessment/auto_assessment/).
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auto_assessment/auto_assessment/ ./auto_assessment/

WORKDIR /app/auto_assessment

# SQLite data lives outside the image so it survives rebuilds/redeploys.
ENV DB_PATH=/data/assessment_history.db
VOLUME ["/data"]

EXPOSE 8000

CMD ["uvicorn", "web:app", "--host", "0.0.0.0", "--port", "8000"]
