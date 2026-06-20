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
CHILDREN=()
cleanup() {
  echo; echo "→ Stopping MailMind…"
  # Kill tracked children and their process groups.
  for pid in "${CHILDREN[@]}"; do
    kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  # Fallback: kill anything still in our process group.
  kill 0 2>/dev/null || true
  sleep 0.5
  # Force-kill survivors.
  for pid in "${CHILDREN[@]}"; do
    kill -9 "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

# ---- preflight: TLS certificate (for PWA / HTTPS) ---------------------------
CERT_DIR="$ROOT/frontend"
CERT="$CERT_DIR/cert.pem"
KEY="$CERT_DIR/key.pem"
if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
  LAN_IP_TEMP=$(hostname -I 2>/dev/null | awk '{print $1}')
  if [[ -n "$LAN_IP_TEMP" ]]; then
    CERT_HOSTS="localhost 127.0.0.1 $LAN_IP_TEMP"
  else
    CERT_HOSTS="localhost 127.0.0.1"
  fi
  if command -v mkcert >/dev/null 2>&1; then
    echo "→ Generating trusted TLS certificate via mkcert…"
    mkcert -install 2>/dev/null
    mkcert -cert-file "$CERT" -key-file "$KEY" $CERT_HOSTS
    echo "✓ Certificate saved to $CERT (trusted by this machine)"
    echo "  To trust on your phone, install the CA cert on it:"
    echo "  $(mkcert -CAROOT)/rootCA.pem"
  else
    echo "→ mkcert not found — generating self-signed cert (browser will warn)…"
    echo "  For a warning-free experience, install mkcert:"
    echo "  https://github.com/FiloSottile/mkcert"
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 \
      -keyout "$KEY" -out "$CERT" -days 3650 -nodes \
      -subj "/CN=MailMind" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" \
      2>/dev/null
    echo "✓ Certificate saved to $CERT"
  fi
fi

# ---- preflight: Ollama ----------------------------------------------------
# Auto-start the local LLM so triage/summaries work out of the box.
# OLLAMA_KEEP_ALIVE frees the model from RAM shortly after a scan, so a long
# rescan doesn't keep memory pinned while idle.
export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-5m}"
OLLAMA_URL="http://localhost:11434"
if curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  echo "→ Ollama already running."
elif command -v ollama >/dev/null 2>&1; then
  echo "→ Starting Ollama …"
  ollama serve >/dev/null 2>&1 &
  for i in $(seq 1 15); do
    curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1 && { echo "✓ Ollama ready."; break; }
    sleep 1
    [[ $i -eq 15 ]] && echo "→ Ollama slow to start — triage features may be delayed."
  done
else
  echo "→ Ollama not found — triage features will be unavailable."
fi

echo "→ Starting backend on :8000 …"
backend/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 \
  --ssl-keyfile "$KEY" --ssl-certfile "$CERT" & CHILDREN+=($!)
BACKEND_PID=$!

echo "→ Starting frontend on :5173 …"
(cd frontend && npm run dev) & CHILDREN+=($!)
FRONTEND_PID=$!

# Give servers a moment, then open the browser if possible.
sleep 2

# ---- LAN IP detection -------------------------------------------------------
LAN_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
if [[ -z "$LAN_IP" ]]; then
  LAN_IP=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)
fi

URL="http://localhost:5173"
if command -v xdg-open >/dev/null 2>&1; then
  (xdg-open "$URL" >/dev/null 2>&1 &) || true
elif command -v open >/dev/null 2>&1; then
  (open "$URL" >/dev/null 2>&1 &) || true
fi
echo
echo "✓ MailMind is running at $URL"
if [[ -n "$LAN_IP" ]]; then
  echo "  LAN: https://$LAN_IP:5173"
  echo "  (open on other devices via the LAN address above)"
  echo "  If unreachable, run: sudo ufw allow 5173"
fi
echo "  Note: self-signed cert — your browser may show a warning."
echo "  (Ctrl-C to stop both servers)"
echo

wait
