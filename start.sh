#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/auto_assessment/auto_assessment"
FRONTEND_DIR="$ROOT_DIR/auto_assessment/frontend"
PYTHON_BIN="$ROOT_DIR/.venv/bin/python3"

if [[ -f "$ROOT_DIR/.env" ]]; then
  set -a
  source "$ROOT_DIR/.env"
  set +a
fi

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_HOST="${FRONTEND_HOST:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  echo
  echo "Stopping servers..."

  if [[ -n "$FRONTEND_PID" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

if [[ ! -x "$PYTHON_BIN" ]]; then
  echo "Python venv not found at $PYTHON_BIN"
  echo "Create it from the project root with:"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/python3 -m pip install -r requirements.txt"
  exit 1
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "Warning: GEMINI_API_KEY is not set."
  echo "Login and the frontend can load, but grading/chat will fail until you run:"
  echo 'export GEMINI_API_KEY="your-real-gemini-api-key"'
fi

if [[ -z "${GOOGLE_CLIENT_ID:-}" ]]; then
  echo "GOOGLE_CLIENT_ID is not set."
  echo "Create an OAuth web client in Google Cloud, then run:"
  echo '  export GOOGLE_CLIENT_ID="your-google-oauth-client-id"'
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies are missing. Installing with npm..."
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "Starting backend:  http://127.0.0.1:$BACKEND_PORT"
(cd "$BACKEND_DIR" && "$PYTHON_BIN" -m uvicorn web:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload) &
BACKEND_PID=$!

echo "Starting frontend: http://127.0.0.1:$FRONTEND_PORT"
(cd "$FRONTEND_DIR" && npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo
echo "Both servers are starting. Press CTRL+C to stop them."
wait "$BACKEND_PID" "$FRONTEND_PID"
