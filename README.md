# MailMind

I have too many email accounts. Work, college, personal, side projects — and every single one of them gets spammed. At some point managing them became its own full-time job: open Gmail, switch account, scroll through 200 newsletters and LinkedIn digests, find the one email that actually needed a reply, repeat for every account. It was exhausting.

So I built MailMind. It pulls all your Gmail accounts into one inbox, runs a local AI model over your emails, and shows you only the ones that actually matter — with a summary so you don't even have to open most of them. No cloud, no subscriptions, no sending your emails to some third-party server. Everything stays on your machine.

---

## What it does

- Connects multiple Gmail accounts and merges them into a single chronological inbox. Each email is tagged with a colored dot so you know which account it came from.
- Runs a local LLM (via Ollama) on every email and scores it 0–10 for importance. Anything above your threshold shows up in the **Important** tab with a one-line reason and an AI-generated summary — so you can triage 100 emails in 2 minutes.
- Categories emails automatically: `action_required`, `deadline`, `financial`, `personal`, `newsletter`, `spam`, or `other`.
- Lets you write your own triage rules in plain English (like "emails from my manager are always important" or "ignore GitHub notifications"). These get injected into the prompt before every scan.
- Syncs incrementally in the background — it only fetches what changed since the last run, so it stays fast.
- Tokens are encrypted at rest and persist across restarts. You authenticate once per account and never again (unless you revoke access).
- Serves over HTTPS on your LAN, so you can open it on your phone and install it as a PWA. It behaves like a native app — hardware back button, pull-to-refresh, AMOLED dark theme, no browser chrome.

---

## Prerequisites

| Tool   | Version | Notes |
|--------|---------|-------|
| Python | 3.11+   | Backend |
| Node   | 18+     | Frontend build (one-time, not needed at runtime) |
| Ollama | any     | Local LLM runtime — [ollama.com](https://ollama.com) |
| mkcert | any     | Optional but recommended — trusted HTTPS so the PWA installs cleanly |

Pull the default model:

```bash
ollama pull hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS
```

Install mkcert for trusted HTTPS (needed for PWA on mobile):

```bash
# Linux
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-* && mkdir -p ~/.local/bin && mv mkcert-* ~/.local/bin/mkcert
mkcert -install

# macOS
brew install mkcert && mkcert -install
```

---

## Setup

### Option 1: one-shot installer (recommended)

This clones the repo, installs Ollama if missing, lets you pick an LLM from a menu, sets up the Python venv and Node deps, and walks you through connecting your `credentials.json`. It's idempotent — running it again skips already-done steps.

```bash
curl -fsSL https://raw.githubusercontent.com/abhed8604/MailMind/main/install.sh | bash
```

Or if you already cloned it:

```bash
bash install.sh
```

### Option 2: manual setup

**Step 1 — Get Gmail OAuth credentials**

MailMind uses a "Desktop app" OAuth client to read your Gmail. You need to create one in Google Cloud (it's free and takes about 5 minutes):

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a project.
2. **APIs & Services → Library** → search **Gmail API** → Enable it.
3. **APIs & Services → OAuth consent screen** — set user type to External, add your own Google account as a test user, and add these scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.labels`
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** — pick **Desktop app**, download the JSON.
5. Save it as `backend/credentials.json`.

> This file is in `.gitignore`. Don't commit it.

**Step 2 — Install dependencies**

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r requirements.txt

# Frontend
cd frontend && npm install && cd ..
```

**Step 3 — Run it**

```bash
./mailmind
```

That's the only command you need. It builds the frontend (cached after the first time), generates a TLS cert, and starts everything on port 8000. It'll print both a localhost and LAN URL.

```
✓ MailMind running at https://localhost:8000
  LAN: https://192.168.x.x:8000
```

> Dev mode with hot reload: `./mailmind --dev`  
> Just build the frontend: `./mailmind --build`  
> Stop: `Ctrl-C`

**Step 4 — Connect your Gmail accounts**

On first launch you'll see a demo inbox with fake emails so you can explore the UI. Once you're ready:

1. **Settings → Gmail Accounts → Add Gmail Account**
2. Approve the Google consent screen in your browser.
3. MailMind pulls your last 500 emails and starts syncing.

Repeat for as many accounts as you want. After this, every time you run `./mailmind` they reconnect automatically.

**Step 5 — Run triage**

The model warms up automatically at startup. Click **⚡ Scan for Important** above the inbox, or enable Auto-scan in Settings to have it run after every sync. Switch to the **Important** tab to see what the model flagged.

The brain icon in the sidebar shows model status: green = ready, amber (pulsing) = loading, red = Ollama isn't running or the model isn't pulled.

---

## Using it on your phone

MailMind serves over HTTPS so it works as an installable PWA on mobile.

1. Start the app and note the LAN address it prints.
2. Make sure your phone is on the same WiFi.
3. Open the URL in Chrome (Android) or Safari (iOS).

To install as an app:
- **Android**: menu → Add to Home Screen, or tap the install prompt in the address bar.
- **iOS**: Share → Add to Home Screen.
- **Desktop**: click the install icon in the address bar.

If you get a cert warning on your phone, either proceed anyway (it's your own cert, it's fine) or install mkcert's root CA on the phone:

```bash
mkcert -CAROOT   # shows where rootCA.pem lives
```

- **Android**: Settings → Security → Install a certificate → CA certificate → pick `rootCA.pem`
- **iOS**: AirDrop the file to your phone, install the profile, then enable it under Settings → General → About → Certificate Trust Settings

If the phone can't reach the server at all: `sudo ufw allow 8000` on the machine running MailMind.

---

## How triage works

For each unscanned email, MailMind sends this to Ollama:

```
{your custom triage rules, if any}

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

The parser handles chatty models gracefully — it strips markdown fences, falls back to regex extraction, and clamps every field. A bad response never breaks the pipeline.

### Writing your own rules

Go to **Settings → Triage Rules** and write plain Markdown:

```markdown
- Emails from my manager are always important.
- Job offer emails or recruiter emails with a role, company, and CTC score 9+.
- Bank and financial transaction emails score 8+.
- GitHub notifications are not important unless they mention me directly.
- Newsletters score 1 unless they contain "invoice" or "payment".
```

These get prepended to every triage prompt. They're saved at `~/.mailmind/triage_rules.md` and survive restarts.

---

## Configuration

Everything is editable from the Settings UI:

| Setting | Default | What it does |
|---------|---------|--------------|
| `sync_interval_minutes` | `5` | How often background sync runs |
| `initial_fetch_count` | `500` | Emails pulled on first connect |
| `ollama_base_url` | `http://localhost:11434` | Ollama endpoint |
| `ollama_model` | `hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS` | Model for triage |
| `auto_scan` | `true` | Auto-triage after each sync |
| `importance_threshold` | `7` | Minimum score to show in Important |
| `dark_mode` | `true` | Dark/light theme |

Runtime files are stored in `~/.mailmind/`:

| File | Contents |
|------|----------|
| `mailmind.db` | SQLite — emails, accounts, settings |
| `accounts.json` | Fernet-encrypted OAuth tokens |
| `triage_rules.md` | Your custom triage rules |
| `master.key` | Fallback encryption key (only if no OS keyring is available, chmod 600) |

---

## Troubleshooting

**"credentials.json not found"** — you skipped the OAuth setup step. Drop the Desktop OAuth JSON at `backend/credentials.json` and restart.

**Add Account hangs** — the OAuth flow waits up to 5 minutes for browser consent. Make sure `localhost` redirects aren't blocked by a popup blocker.

**"needs reauth" badge** — refresh token expired or was revoked. Remove the account in Settings and re-add it.

**Triage says "Ollama unavailable"** — run `ollama serve` and confirm the model is pulled with `ollama list`. The brain icon in the sidebar also lets you kick off a warmup manually.

**Model keeps unloading** — increase the keep-alive timeout: `OLLAMA_KEEP_ALIVE=30m ./mailmind`

**Phone can't connect to the LAN address** — allow the port through the firewall: `sudo ufw allow 8000`. Confirm both devices are on the same WiFi.

**Browser shows a cert warning** — that's the self-signed fallback (mkcert wasn't installed). Safe to proceed, or install mkcert and restart to get a trusted cert. For the phone to trust it too, install mkcert's root CA on the phone (see above).

**"Add to Home Screen" opens in a browser tab instead of standalone** — clear the site's storage in Chrome (site settings → Clear data), reopen the HTTPS URL, and try again.

**Stale UI after updating** — the service worker cached the old bundle. Clear site data or do a hard refresh (`Ctrl-Shift-R`).

**Reset everything** — quit the app, delete `~/.mailmind/`, restart. You'll need to re-add Gmail accounts.

---

## Privacy

The only outbound network calls are to `gmail.googleapis.com` (your mail) and your local Ollama instance (`localhost:11434`). No analytics, no telemetry, no third-party APIs. Your emails never leave your machine.
