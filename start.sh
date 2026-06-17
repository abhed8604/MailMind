#!/usr/bin/env bash
# MailMind launcher — starts the FastAPI backend and the Vite dev server
# together, and opens the browser at http://localhost:5173.
#
# Usage:
#   ./start.sh            start both servers (foreground, Ctrl-C to stop)
#   ./start.sh --build    build the frontend for production first
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# ---- preflight -----------------------------------------------------------
if [[ ! -d backend/.venv ]]; then
  echo "→ Creating Python venv at backend/.venv …"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --upgrade pip -q
fi

if ! backend/.venv/bin/pip show fastapi -q >/dev/null 2>&1; then
  echo "→ Installing Python dependencies …"
  backend/.venv/bin/pip install -r requirements.txt -q
fi

if [[ ! -d frontend/node_modules ]]; then
  echo "→ Installing frontend dependencies …"
  (cd frontend && npm install)
fi

# Optional production build instead of the dev server.
if [[ "${1:-}" == "--build" ]]; then
  echo "→ Building frontend for production …"
  (cd frontend && npm run build)
fi

# ---- run both ------------------------------------------------------------
cleanup() {
  echo
  echo "→ Stopping MailMind …"
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "→ Starting backend on :8000 …"
backend/.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "→ Starting frontend on :5173 …"
(cd frontend && npm run dev) &
FRONTEND_PID=$!

# Give servers a moment, then open the browser if possible.
sleep 2
URL="http://localhost:5173"
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "$URL" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "$URL" >/dev/null 2>&1 &) || true
fi
echo
echo "✓ MailMind is running at $URL"
echo "  (Ctrl-C to stop both servers)"
echo

wait
