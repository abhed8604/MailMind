# MailMind

A local-first desktop web app that aggregates **multiple Gmail accounts** into a
single unified inbox and uses a **local LLM (Ollama)** to surface the emails
that actually matter.

Everything runs on `localhost`. No cloud, no telemetry — your mail only ever
touches your machine and Gmail's own API.

---

## Features

- **Multi-account unified inbox** — every connected Gmail account in one
  chronological feed, each email tagged with a color-coded account dot.
- **Local LLM triage** — each email is classified by a local model
  (`hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS` by default) into
  `important` + a category (`action_required`, `deadline`, `financial`,
  `personal`, `newsletter`, `spam`, `other`), with a 0–10 score, a one-line
  reason, and an **AI summary** shown above the email body.
- **Auto model warmup** — the configured LLM model is preloaded into RAM at
  startup so the first scan is instant. A live status indicator in the sidebar
  (green/amber/red dot) shows whether the model is ready, loading, or
  unavailable — click it to manually start or reload.
- **Custom triage rules** — write your own importance rules in plain Markdown
  (editable from Settings). They're prepended to the triage prompt so the model
  applies your criteria before classifying each email.
- **Robust scan pipeline** — scans up to 500 emails per pass, retries once
  after 30s if Ollama is unavailable, and marks parse errors as scanned (so
  emails don't re-queue forever). A floating progress bar with cancel button
  tracks the scan in real time.
- **Incremental sync** — first connect fetches your last N emails; afterwards a
  background job uses Gmail's `historyId` to pull only what changed every few
  minutes.
- **Stays connected across restarts** — tokens persist (encrypted), and on every
  launch MailMind refreshes them and resumes syncing automatically. No
  re-authentication needed unless you revoke access.
- **Encrypted token storage** — OAuth tokens are Fernet-encrypted at rest in
  `~/.mailmind/accounts.json`; the encryption key lives in your OS keyring.
- **Responsive UI** — flat dark three-panel shell (sidebar / resizable list /
  reader) on desktop, full-screen panels with drawer sidebar on mobile (<768px).
  Tab switching uses fade-slide animation.
- **Single-command launcher** — `./mailmind` builds the frontend once and serves
  everything (API + UI) from one process on a single port.
- **Demo mode** — seed the UI with ~30 realistic mock emails so you can explore
  it before connecting real accounts or pulling a model (auto-disables once you
  connect a real account).

---

## Prerequisites

| Tool   | Version            | Notes                                            |
|--------|--------------------|--------------------------------------------------|
| Python | 3.11+ (tested 3.14)| Backend                                          |
| Node   | 18+ (tested 22)    | Frontend build (one-time; not needed at runtime) |
| Ollama | any recent         | Local LLM runtime — `ollama.com`                 |

Install Ollama and pull the default model:

```bash
ollama pull hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS   # one-time
```

---

## Setup

There are two ways to get started: the **one-shot installer** (recommended for
new machines) or the **manual setup** (if you've already cloned the repo).

### Quick start: one-shot installer

A single bootstrap script clones the repo, installs Ollama, lets you pick an LLM
model from a menu, sets up the Python venv + Node deps, and walks you through a
`credentials.json` wizard — then offers to launch the app.

```bash
curl -fsSL https://raw.githubusercontent.com/abhed8604/MailMind/main/install.sh | bash
```

Or, if you've already cloned the repo:

```bash
bash install.sh
```

The installer will prompt you for:

- **Install location** — where to clone MailMind (defaults to `~/MailMind`).
- **Ollama** — installs it if missing (Linux: `ollama.com` installer; macOS:
  Homebrew if available).
- **LLM model** — pick from a menu: Gemma 4 E2B (default), Llama 3.1 8B,
  Qwen2.5 3B, TinyLlama 1.1B, or skip and pull later.
- **`credentials.json`** — paste your Google OAuth Desktop JSON directly, or
  skip and add it later at `backend/credentials.json`.
- **Launch** — start the app immediately via `./mailmind`, or exit and run it
  yourself.

It's idempotent: re-running it skips already-done steps (Ollama installed, venv
present, deps installed), so it doubles as an updater.

### Manual setup

#### 1. Gmail OAuth credentials (the one manual step)

MailMind needs its own OAuth "Desktop app" client to talk to Gmail on your
behalf.

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or pick an existing one).
3. **APIs & Services → Library →** search **Gmail API → Enable**.
4. **APIs & Services → OAuth consent screen:**
   - User type **External** (it's just you — add your own Google account as a
     test user).
   - Add the scopes:
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.modify`
     - `https://www.googleapis.com/auth/gmail.labels`
5. **APIs & Services → Credentials → Create credentials → OAuth client ID:**
   - Application type: **Desktop app**.
   - Download the resulting JSON.
6. Save it as **`backend/credentials.json`** (next to `main.py`).

> This file is in `.gitignore`. Never commit it.

#### 2. Install dependencies

The first run of `./mailmind` installs everything, but you can do it manually:

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

#### 3. Run

```bash
./mailmind
```

This is the **single command**: it ensures the Python venv + deps are installed,
builds the frontend once (cached afterward), then starts **one** uvicorn process
that serves both the API and the built UI on `http://localhost:8000`, and opens
your browser.

> **Dev mode** (with Vite hot-reload): `./mailmind --dev` — runs the backend on
> `:8000` and Vite on `:5173` (API requests proxy through to the backend).

> **Just build the frontend** (no server): `./mailmind --build`.

> **Stop the server**: press `Ctrl-C` in the terminal — it cleanly kills the
> backend and frees port 8000.

**On first launch the app runs in Demo Mode** — it seeds ~30 fake emails (some
already triaged) so the UI is fully explorable with zero setup. Demo mode
**auto-disables** the moment you connect a real Gmail account.

### 4. Connect a Gmail account (do this once)

1. Open **Settings → Gmail Accounts → Add Gmail Account**.
2. Your browser opens Google's consent screen. Approve.
3. The backend captures the OAuth redirect, stores the **encrypted** token, and
   immediately pulls your **last 500 historical emails** (configurable) —
   inline, so you see them appear right away.

Repeat for as many accounts as you like. **From now on, every time you run
`./mailmind`, all your accounts reconnect automatically** — no re-consent
needed, and incremental sync resumes within seconds.

### 5. Run triage

The LLM model is **automatically warmed up at startup** so it's ready to scan.
Click **⚡ Scan for Important** above the inbox (or the scheduler does it
automatically after each sync if **Auto-scan** is on). Switch to the
**Important** tab to see results sorted by score.

If the model isn't ready, the **brain icon** in the sidebar shows a pulsing
amber dot — click it to start/reload the model manually.

---

## Project structure

```
mailmind/
├── backend/
│   ├── main.py              # FastAPI app, CORS, startup/lifespan, LLM warmup
│   ├── accounts.py          # OAuth2 flow, encrypted token storage
│   ├── gmail_sync.py        # Gmail fetch + incremental sync + backoff
│   ├── database.py          # SQLAlchemy models, settings store
│   ├── security.py          # Fernet via OS keyring, accounts.json
│   ├── scheduler.py         # APScheduler background sync
│   ├── llm_triage.py        # Ollama client + prompt + JSON parsing + warmup
│   ├── triage_runner.py     # DB <-> LLM bridge (batch scans, 500 limit, retry)
│   ├── triage_rules.py      # User-editable markdown triage rules
│   ├── mock_data.py         # Demo-mode seed data
│   ├── smoke_test.py        # Live triage pipeline test
│   └── routes/
│       ├── emails.py        # /emails list/detail/patch
│       ├── accounts.py      # /accounts + OAuth start
│       ├── sync.py          # /sync + /sync/status
│       ├── triage.py        # /triage scan/rescan/warmup/model-status
│       └── settings.py      # /settings get/put + clear-data
├── frontend/
│   ├── public/favicon.svg   # MailMind logo (envelope + AI spark)
│   └── src/
│       ├── App.jsx          # Shell, desktop 3-panel + mobile responsive layout
│       ├── index.css        # Flat dark theme, responsive media queries
│       ├── components/
│       │   ├── Sidebar.jsx       # 48px icon rail, LLM status indicator
│       │   ├── EmailList.jsx     # Filterable email list with tab pills
│       │   ├── EmailCard.jsx     # Single email row (sender, preview, score, star)
│       │   ├── EmailReader.jsx   # Reading pane with AI summary + iframe body
│       │   ├── Settings.jsx      # Flat dark settings panel
│       │   ├── ScanProgressBar.jsx  # Floating scan progress pill
│       │   ├── Icon.jsx          # SVG icon components (including BrainIcon)
│       │   ├── Toast.jsx         # Toast notification system
│       │   ├── SearchBar.jsx     # Search input component
│       │   └── TriageBadge.jsx   # Category/relevance badge
│       ├── hooks/
│       │   ├── useEmails.js      # Email fetching, pagination, toggle read/star
│       │   ├── useSync.js        # WebSocket sync events
│       │   ├── useResizable.js   # Drag-to-resize list/reader divider
│       │   └── useIsMobile.js    # Viewport breakpoint detection (< 768px)
│       ├── api/
│       │   └── client.js        # Axios wrapper for all backend endpoints
│       └── lib/
│           ├── categories.js     # Triage category metadata + score badge styles
│           └── company.js        # Email domain → brand color mapping
├── start.sh                 # Dev launcher (backend :8000 + Vite :5173)
├── mailmind                 # Single-command launcher (build + serve on :8000)
├── install.sh               # One-shot bootstrap installer
├── requirements.txt
└── README.md
```

At runtime, MailMind creates `~/.mailmind/` containing:

| File               | Contents                                              |
|--------------------|-------------------------------------------------------|
| `mailmind.db`      | SQLite — emails, accounts, settings.                  |
| `accounts.json`    | Fernet-encrypted OAuth tokens (one blob per account). |
| `triage_rules.md`  | Your custom importance rules (editable from Settings).|
| `master.key`       | **Only if no OS keyring is available** — the fallback Fernet key (chmod 600). |

---

## Configuration

All config lives in the SQLite `settings` table and is editable from the UI:

| Setting                | Default                  | What it does                                   |
|------------------------|--------------------------|------------------------------------------------|
| `sync_interval_minutes`| `5`                      | How often the background sync runs.            |
| `initial_fetch_count`  | `500`                    | Emails pulled on first connect.                |
| `ollama_base_url`      | `http://localhost:11434` | Ollama HTTP endpoint.                          |
| `ollama_model`         | `hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS` | Model used for triage. |
| `auto_scan`            | `true`                   | Auto-triage new emails after each sync.        |
| `importance_threshold` | `7`                      | Minimum score to appear in Important.          |
| `mock_mode`            | `true`                   | Auto-disabled once a real account is connected. |
| `dark_mode`            | `true`                   | Dark vs light theme.                           |

---

## How triage works

For each unscored email, MailMind sends a structured prompt to Ollama. If you've
written **custom triage rules** (in Settings, stored at
`~/.mailmind/triage_rules.md`), they are prepended to the prompt so the model
applies your criteria first:

```
{your custom rules, if any}

You are an email importance classifier. Analyze this email and respond ONLY with valid JSON.

Email:
From: {sender}
Subject: {subject}
Body: {body_text[:1500]}

Respond with:
{"important": true/false, "score": 0-10, "reason": "one sentence explanation",
 "category": "action_required|deadline|financial|personal|newsletter|spam|other",
 "summary": "one paragraph summary of the email content"}
```

The parser is defensive: it strips `` ```json `` fences, falls back to a
regex `{...}` extraction, and clamps/sanitizes every field — so an occasionally
chatty model never breaks the pipeline. Results are stored on the email row.

### Model warmup & status

On every startup, MailMind probes Ollama and preloads the configured model into
RAM in a background thread. The **brain icon** in the sidebar reflects the status:

| Dot color | Meaning | Action |
|-----------|---------|--------|
| 🟢 Green | Model ready | Scan will be fast. |
| 🟡 Amber (pulsing) | Model loading | Wait or click to reload. |
| 🔴 Red | Ollama unavailable / model not installed | Start Ollama or check model name in Settings. |

### Custom triage rules

Open **Settings → Triage Rules** to write plain-Markdown instructions that shape
what the model considers important. For example:

```markdown
# My priorities

- Emails from my manager or direct reports are always important.
- Pull-request review requests are important; GitHub notifications are not.
- Receipts and invoices should be tagged "financial".
- Ignore newsletters unless they mention "invoice" or "payment".
```

These are injected verbatim at the top of every triage prompt. They persist at
`~/.mailmind/triage_rules.md` and survive restarts.

If Ollama is **not running**, triage features disable gracefully: the "Scan"
button reports the outage via toast, the status indicator shows red, and the
rest of the app keeps working. While a scan runs, a floating progress bar
appears at the bottom of the screen showing live `scanned/total` counts with a
**Cancel** button to stop after the current batch.

---

## Troubleshooting

- **"credentials.json not found"** — you skipped step 1 of Setup. Drop the
  Desktop OAuth JSON at `backend/credentials.json` and restart.
- **Add Account hangs** — the OAuth flow blocks for up to 5 minutes waiting for
  consent. Make sure popups/redirects to `localhost` aren't blocked.
- **"needs reauth" badge** — your refresh token expired or was revoked. Remove
  the account in Settings and re-add it.
- **Triage "Ollama unavailable"** — start Ollama (`ollama serve` or the desktop
  app) and confirm the model is pulled (`ollama list`). The brain icon in the
  sidebar also lets you kick off a warmup.
- **Model keeps unloading** — increase `OLLAMA_KEEP_ALIVE` before launching:
  `OLLAMA_KEEP_ALIVE=30m ./mailmind`.
- **Using a keyfile instead of a keyring** — on a headless box with no secret
  service, MailMind falls back to `~/.mailmind/master.key` (chmod 600) and logs
  a warning. For better security, install `gnome-keyring` or run a Secret
  Service provider.
- **Reset everything** — quit the app, delete `~/.mailmind/`, restart. You'll
  need to re-add Gmail accounts.

---

## Roadmap (deferred "extras")

These were intentionally left out of the first build and are easy to add on top
of the current schema/hooks:

- Thread view (group by `thread_id`)
- Keyboard shortcuts (`j/k/Enter/u/i`)
- Export Important emails as CSV/PDF
- Triage history log table
- Per-account sync pause toggle
- Send / compose emails

---

## Privacy

MailMind is single-user and local. The only outbound network calls are to
`gmail.googleapis.com` (for mail) and your local Ollama (`localhost:11434`).
No analytics, no third-party APIs.
