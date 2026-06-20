#!/usr/bin/env bash
# MailMind — one-shot bootstrap installer.
#
# Clones the repo, installs Ollama + a chosen LLM model, sets up the Python
# venv and Node deps, walks through a credentials.json wizard, and offers
# to launch the app.
#
# Usage (from anywhere):
#   bash install.sh
#
set -euo pipefail

# ─── colours & helpers ──────────────────────────────────────────────────────
if [[ -t 1 ]] && command -v tput >/dev/null 2>&1; then
  BOLD="$(tput bold)"
  GREEN="$(tput setaf 2)"
  YELLOW="$(tput setaf 3)"
  CYAN="$(tput setaf 6)"
  RED="$(tput setaf 1)"
  DIM="$(tput dim)"
  RST="$(tput sgr0)"
else
  BOLD="" GREEN="" YELLOW="" CYAN="" RED="" DIM="" RST=""
fi

info()  { echo "${GREEN}✓${RST} $*"; }
warn()  { echo "${YELLOW}→${RST} $*"; }
fail()  { echo "${RED}✗${RST} $*" >&2; }
step()  { echo; echo "${CYAN}${BOLD}━━ $* ━━${RST}"; echo; }
prompt() { echo -n "${DIM}$*${RST} "; }

# ─── banner ─────────────────────────────────────────────────────────────────
cat <<'BANNER'

    __  ___      _ ____  ____           __
   /  |/  /___ _(_) /  |/  (_)___  ____/ /
  / /|_/ / __ `/ / / /|_/ / / __ \/ __  /
 / /  / / /_/ / / / /  / / / / / /_/ /
/_/  /_/\__,_/_/_/_/  /_/_/_/ /_/\__,_/

       AI-Powered Email Triage . Bootstrap Installer

BANNER

# ─── 1. preflight dependency checks ────────────────────────────────────────
step "Checking prerequisites"

MISSING=()
for cmd in git python3 node npm curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    MISSING+=("$cmd")
  fi
done

if [[ ${#MISSING[@]} -ne 0 ]]; then
  fail "Missing required tools: ${MISSING[*]}"
  echo
  echo "  Install them first, then re-run this script."
  case "$(uname -s)" in
    Linux)
      echo "  On Debian/Ubuntu:  sudo apt install git python3 python3-venv nodejs npm curl"
      echo "  On Fedora:         sudo dnf install git python3 nodejs npm curl"
      ;;
    Darwin)
      echo "  On macOS:  brew install git node python@3 curl"
      ;;
  esac
  exit 1
fi

# Verify python3 can create venvs
if ! python3 -c "import venv" 2>/dev/null; then
  fail "Python venv module missing. Install python3-venv (Debian/Ubuntu) or ensure python3 includes it."
  exit 1
fi

info "git, python3, node, npm, curl — all present"

# ─── 2. ask install location ──────────────────────────────────────────────
step "Choose install location"

REPO_URL="${MAILMIND_REPO_URL:-https://github.com/abhed8604/MailMind.git}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If already inside a MailMind repo, offer to use cwd
IN_REPO=false
if [[ -f "$SCRIPT_DIR/backend/main.py" ]] && [[ -f "$SCRIPT_DIR/requirements.txt" ]]; then
  IN_REPO=true
fi

DEFAULT_DIR="$HOME/MailMind"
prompt "Where should MailMind be installed? [$DEFAULT_DIR]"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
INSTALL_DIR="$(eval echo "$INSTALL_DIR")"  # expand ~

if $IN_REPO && [[ "$(cd "$SCRIPT_DIR" && pwd)" != "$(cd "$INSTALL_DIR" && pwd 2>/dev/null || true)" ]]; then
  warn "Note: you're running this from $SCRIPT_DIR which already looks like MailMind."
  prompt "  Use the current directory instead? [Y/n]"
  read -r USE_CWD
  case "${USE_CWD:-y}" in
    n*|N*) ;;  # keep user's choice
    *)    INSTALL_DIR="$SCRIPT_DIR" ;;
  esac
fi

# ─── 3. clone or update repo ────────────────────────────────────────────────
step "Fetching MailMind repository"

if [[ -d "$INSTALL_DIR/.git" ]]; then
  warn "Directory $INSTALL_DIR already has a git repo."
  prompt "  Update with git pull? [Y/n]"
  read -r DO_PULL
  case "${DO_PULL:-y}" in
    n*|N*)
      warn "Skipping git pull. Using existing files."
      ;;
    *)
      cd "$INSTALL_DIR"
      git pull --ff-only 2>/dev/null || fail "git pull failed — check for conflicts or uncommitted changes"
      info "Repository updated."
      ;;
  esac
elif [[ -d "$INSTALL_DIR" ]] && [[ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]]; then
  fail "Directory $INSTALL_DIR exists and is not empty (and has no .git)."
  prompt "  Pick a different location or remove/rename that directory, then re-run."
  exit 1
else
  info "Cloning $REPO_URL → $INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  info "Repository cloned."
fi

cd "$INSTALL_DIR"
info "Working in $INSTALL_DIR"

# ─── 4. install Ollama (OS-detected) ───────────────────────────────────────
step "Setting up Ollama (local LLM engine)"

if command -v ollama >/dev/null 2>&1; then
  info "Ollama is already installed."
else
  OS="$(uname -s)"
  case "$OS" in
    Linux)
      echo
      echo "  MailMind uses Ollama for AI triage."
      echo "  Installer: https://ollama.com/install.sh"
      prompt "  Install Ollama now? [Y/n]"
      read -r INSTALL_OLLAMA
      case "${INSTALL_OLLAMA:-y}" in
        n*|N*)
          warn "Skipping Ollama install. AI triage features will be unavailable until you install it."
          ;;
        *)
          curl -fsSL https://ollama.com/install.sh | sh
          # Ensure ollama is on PATH after install
          export PATH="$PATH:/usr/local/bin"
          if command -v ollama >/dev/null 2>&1; then
            info "Ollama installed successfully."
          else
            fail "Ollama installed but not found on PATH. You may need to open a new terminal."
          fi
          ;;
      esac
      ;;
    Darwin)
      if command -v brew >/dev/null 2>&1; then
        prompt "  Install Ollama via Homebrew? [Y/n]"
        read -r INSTALL_OLLAMA
        case "${INSTALL_OLLAMA:-y}" in
          n*|N*)
            warn "Skipping Ollama install. AI triage will be unavailable."
            ;;
          *)
            brew install ollama
            info "Ollama installed via Homebrew."
            ;;
        esac
      else
        warn "Homebrew not found. Install Ollama manually:"
        echo "  1. Download from https://ollama.com/download/mac"
        echo "  2. Move the .app to /Applications"
        echo "  3. Open Ollama from Launchpad, then re-run this script."
        prompt "  Press Enter once Ollama is installed (or 's' to skip)…"
        read -r OLLAMA_CONT
        case "${OLLAMA_CONT:-}" in
          s*|S*) warn "Skipping Ollama install." ;;
          *) ;;
        esac
      fi
      ;;
    *)
      warn "Unsupported OS ($OS). Install Ollama manually from https://ollama.com."
      ;;
  esac
fi

# ─── 5. start Ollama + model selection ────────────────────────────────────
step "Configuring LLM model"

export OLLAMA_KEEP_ALIVE="${OLLAMA_KEEP_ALIVE:-5m}"
OLLAMA_URL="http://localhost:11434"

if curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
  info "Ollama is already running."
elif command -v ollama >/dev/null 2>&1; then
  warn "Starting Ollama…"
  ollama serve >/dev/null 2>&1 &
  # Wait up to 15s for the API to come up.
  for i in $(seq 1 15); do
    if curl -sf "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
      info "Ollama ready."
      break
    fi
    sleep 1
    [[ $i -eq 15 ]] && warn "Ollama is slow to start — you can pull models later via 'ollama pull'"
  done
else
  warn "Ollama not available — skipping model setup."
  warn "Install Ollama and run 'ollama pull <model>' before using MailMind."
  CHOSEN_MODEL=""
fi

if [[ -n "${CHOSEN_MODEL:-}" ]] || command -v ollama >/dev/null 2>&1; then
  echo
  echo "${BOLD}  Choose an LLM model for email triage:${RST}"
  echo
  echo "  ${CYAN}1)${RST} Gemma 4 E2B   (default, efficient & fast)"
  echo "  ${CYAN}2)${RST} Llama 3.1 8B   (more capable, ~4.7 GB)"
  echo "  ${CYAN}3)${RST} Qwen2.5 3B     (lighter & faster, ~1.9 GB)"
  echo "  ${CYAN}4)${RST} TinyLlama 1.1B (very light, ~638 MB)"
  echo "  ${CYAN}5)${RST} Skip — I'll choose a model later"
  echo
  prompt "  Enter choice [1-5]"
  read -r MODEL_CHOICE

  case "${MODEL_CHOICE:-1}" in
    1) CHOSEN_MODEL="hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS" ;;
    2) CHOSEN_MODEL="llama3.1:8b" ;;
    3) CHOSEN_MODEL="qwen2.5:3b" ;;
    4) CHOSEN_MODEL="tinyllama:1.1b" ;;
    5)
      warn "Skipping model pull. You can pull one later:  ollama pull <model-name>"
      CHOSEN_MODEL=""
      ;;
    *)
      warn "Invalid choice. Defaulting to Gemma 4 E2B."
      CHOSEN_MODEL="hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS"
      ;;
  esac

  if [[ -n "$CHOSEN_MODEL" ]]; then
    warn "Pulling model: $CHOSEN_MODEL"
    warn "  (this can take a while depending on your internet speed)"
    ollama pull "$CHOSEN_MODEL"
    info "Model pulled: $CHOSEN_MODEL"
  fi
fi

# ─── 6. Python virtual environment ──────────────────────────────────────────
step "Setting up Python environment"

if [[ ! -d backend/.venv ]]; then
  warn "Creating Python venv at backend/.venv…"
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --upgrade pip -q
  info "Virtual environment created."
else
  info "Virtual environment already exists."
fi

if ! backend/.venv/bin/pip show fastapi -q >/dev/null 2>&1; then
  warn "Installing Python dependencies…"
  backend/.venv/bin/pip install -r requirements.txt -q
  info "Python dependencies installed."
else
  info "Python dependencies up to date."
fi

# ─── 7. frontend build ─────────────────────────────────────────────────────
step "Setting up frontend"

DIST="frontend/dist"
NEEDS_BUILD=false
if [[ ! -d "$DIST" ]] || [[ ! -f "$DIST/index.html" ]]; then
  NEEDS_BUILD=true
fi

if [[ ! -d frontend/node_modules ]]; then
  warn "Installing frontend dependencies…"
  (cd frontend && npm install)
  NEEDS_BUILD=true
  info "Frontend dependencies installed."
else
  info "Frontend dependencies up to date."
fi

if [[ "$NEEDS_BUILD" == true ]]; then
  warn "Building frontend…"
  (cd frontend && npm run build)
  info "Frontend built to $DIST/"
else
  info "Frontend already built."
fi

# ─── 8. credentials.json setup wizard ──────────────────────────────────────
step "Gmail OAuth credentials setup"

CREDS_PATH="$INSTALL_DIR/backend/credentials.json"

if [[ -f "$CREDS_PATH" ]]; then
  # Validate existing file
  if python3 -c "
import json, sys
try:
    with open('$CREDS_PATH') as f:
        data = json.load(f)
    if 'installed' in data or 'web' in data:
        sys.exit(0)
    else:
        sys.exit(1)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
    info "credentials.json already present and valid."
else
    warn "credentials.json exists but appears invalid."
    prompt "  Overwrite? [y/N]"
    read -r OVERWRITE
    case "${OVERWRITE:-n}" in
      y*|Y*) ;;  # continue to wizard
      *)      warn "Keeping existing file. You can replace it manually at $CREDS_PATH";;
    esac
  fi
fi

if [[ ! -f "$CREDS_PATH" ]] || [[ "${OVERWRITE:-}" =~ ^[Yy]$ ]]; then
  echo
  echo "${BOLD}  MailMind needs a Google Cloud OAuth credential file${RST}"
  echo "  to connect to Gmail. This is a one-time setup."
  echo
  echo "  Quick steps:"
  echo "    1. Go to ${CYAN}https://console.cloud.google.com${RST}"
  echo "    2. Create a project (or pick existing)"
  echo "    3. Enable the ${YELLOW}Gmail API${RST}"
  echo "    4. Go to APIs & Services → Credentials"
  echo "    5. Create an OAuth 2.0 Client ID (${YELLOW}Desktop app${RST} type)"
  echo "    6. Download JSON and ${GREEN}paste it below${RST}"
  echo
  prompt "  Paste your credentials JSON now (type 'skip' to do this later)"
  echo  "${RST}"
  # Read multi-line input until a line that is just "EOF"
  PASTE_INPUT=""
  while IFS= read -r line; do
    [[ "$line" == "EOF" ]] && break
    if [[ "$line" == "skip" ]] && [[ -z "$PASTE_INPUT" ]]; then
      warn "Skipping credentials setup."
      break
    fi
    PASTE_INPUT="${PASTE_INPUT}${line}"$'\n'
  done

  if [[ -n "$PASTE_INPUT" ]]; then
    # Validate the JSON
    TMP_PASTE=$(mktemp)
    echo "$PASTE_INPUT" > "$TMP_PASTE"

    if python3 -c "
import json, sys
try:
    with open('$TMP_PASTE') as f:
        data = json.load(f)
    if 'installed' in data or 'web' in data:
        sys.exit(0)
    else:
        print('Error: JSON is valid but does not look like a Google OAuth credential file.')
        sys.exit(1)
except json.JSONDecodeError as e:
    print(f'Error: Invalid JSON — {e}')
    sys.exit(1)
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
" 2>/dev/null; then
      mkdir -p "$(dirname "$CREDS_PATH")"
      cp "$TMP_PASTE" "$CREDS_PATH"
      chmod 600 "$CREDS_PATH"
      info "credentials.json saved to $CREDS_PATH"
    else
      warn "Pasted JSON is invalid. You can add credentials.json later at:"
      warn "  $CREDS_PATH"
    fi

    rm -f "$TMP_PASTE"
  else
    warn "No credentials provided. You can add credentials.json later at:"
    warn "  $CREDS_PATH"
  fi
fi

# ─── 9. save model to DB settings ─────────────────────────────────────────
if [[ -n "${CHOSEN_MODEL:-}" ]]; then
  warn "Saving model preference to database…"
  cd "$INSTALL_DIR"
  backend/.venv/bin/python - <<PY
import os, sys
sys.path.insert(0, "$INSTALL_DIR")
os.chdir("$INSTALL_DIR")
from backend.database import init_db, set_setting, SessionLocal

init_db()
with SessionLocal() as db:
    set_setting(db, "ollama_model", "$CHOSEN_MODEL")
print("Model saved: $CHOSEN_MODEL")
PY
  info "Default model set to $CHOSEN_MODEL"
else
  # Still init the DB so the app doesn't crash on first launch
  cd "$INSTALL_DIR"
  backend/.venv/bin/python -c "
import os, sys
sys.path.insert(0, '$INSTALL_DIR')
os.chdir('$INSTALL_DIR')
from backend.database import init_db
init_db()
print('Database initialized.')
" 2>/dev/null || warn "Could not initialize database (may need credentials.json)."
fi

# ─── 10. offer to launch ──────────────────────────────────────────────────
echo
step "Setup complete!"

echo "  ${GREEN}${BOLD}MailMind is ready!${RST}"
echo
echo "  Installed at:  ${CYAN}$INSTALL_DIR${RST}"
echo "  Credentials:   ${CYAN}$CREDS_PATH${RST}"
if [[ -n "${CHOSEN_MODEL:-}" ]]; then
  echo "  LLM model:     ${CYAN}$CHOSEN_MODEL${RST}"
else
  echo "  LLM model:     ${YELLOW}not configured${RST} (run 'ollama pull <model>')"
fi
echo
echo "  Next steps (manual):"
echo "    cd $INSTALL_DIR"
echo "    ./mailmind"
echo
prompt "Launch MailMind now? [Y/n]"
read -r LAUNCH
echo "${RST}"

case "${LAUNCH:-y}" in
  n*|N*)
    echo
    echo "  All done! When you're ready:"
    echo "    ${CYAN}cd $INSTALL_DIR && ./mailmind${RST}"
    echo
    ;;
  *)
    echo
    warn "Launching MailMind…"
    exec "$INSTALL_DIR/mailmind"
    ;;
esac
