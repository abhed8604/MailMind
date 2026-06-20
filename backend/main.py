"""MailMind FastAPI application.

Startup responsibilities:
  * create tables + seed default settings
  * auto-seed mock data when ``mock_mode`` is on and no real accounts exist
  * reconcile persisted OAuth tokens → Account rows (recreate if orphaned)
  * validate/refresh every real account's token (stays connected across restarts)
  * kick off incremental sync for all reconnected accounts
  * register all routers and start the background sync scheduler
  * serve the built SPA from ``frontend/dist`` (single-process mode)
"""
from __future__ import annotations

import logging
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import mock_data, scheduler
from .database import (
    Account,
    SessionLocal,
    get_all_settings,
    get_setting,
    init_db,
    set_setting,
)
from .routes import accounts as accounts_router
from .routes import emails as emails_router
from .routes import settings as settings_router
from .routes import sync as sync_router
from .routes import triage as triage_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
log = logging.getLogger("mailmind.main")

DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


# ---------------------------------------------------------------------------
# Startup helpers
# ---------------------------------------------------------------------------
def _reconcile_accounts(db) -> int:
    """Ensure every token in accounts.json has an Account row; return count of
    rows recreated (reconciliation safety net after a DB wipe)."""
    from . import security

    created = 0
    tokens = security.load_accounts_file()
    for email, entry in tokens.items():
        existing = db.query(Account).filter_by(email=email).first()
        if existing is None:
            acc = Account(email=email, color=entry.get("color", "#60a5fa"))
            db.add(acc)
            created += 1
            log.info("Reconciled account row for %s (token existed but row was missing).", email)
    if created:
        db.commit()
    return created


def _reconnect_accounts() -> None:
    """Validate/refresh every real account's token and schedule a sync.

    This is what makes the app "stay connected" across restarts: tokens persist
    in accounts.json, and on each boot we prove they still work, refresh them
    if expired, and immediately queue an incremental fetch.
    """
    from . import accounts as accounts_mod
    from . import gmail_sync

    with SessionLocal() as db:
        # First, reconcile orphaned tokens.
        _reconcile_accounts(db)

        # Auto-disable mock_mode once a real account exists, so demo data
        # doesn't clutter the UI alongside real accounts.
        real_count = (
            db.query(Account)
            .filter(Account.email != mock_data.MOCK_ACCOUNT_EMAIL)
            .count()
        )
        if real_count > 0:
            from .database import get_setting
            current_mock = get_setting(db, "mock_mode")
            if current_mock:
                set_setting(db, "mock_mode", False)
                log.info("Auto-disabled mock_mode (%d real account(s) connected).", real_count)

        accounts = (
            db.query(Account)
            .filter(Account.email != mock_data.MOCK_ACCOUNT_EMAIL)
            .filter(Account.paused.is_(False))
            .all()
        )

    reconnected = 0
    for acc in accounts:
        with SessionLocal() as s:
            row = s.get(Account, acc.id)
            if row is None:
                continue
            try:
                # build_gmail_service refreshes the token and persists the
                # updated access token via _persist_refreshed_credentials.
                service = accounts_mod.build_gmail_service(row)
                accounts_mod._flag_needs_reauth(row, False)  # clear flag
                reconnected += 1
            except accounts_mod.NeedsReauthError:
                log.warning("Account %s needs re-auth on startup (refresh failed).", row.email)
                continue
            except Exception:
                log.exception("Unexpected error reconnecting %s", row.email)
                continue

    log.info("Reconnected %d/%d account(s) on startup.", reconnected, len(accounts))

    if reconnected > 0:
        # Incremental sync for all reconnected accounts in a background thread
        # so startup isn't blocked by network I/O.
        def _bg_sync():
            account_ids = [a.id for a in accounts]
            for aid in account_ids:
                with SessionLocal() as s:
                    row = s.get(Account, aid)
                    if row and not row.needs_reauth:
                        try:
                            gmail_sync.sync_account(row)
                        except Exception:
                            log.exception("Startup incremental sync failed for %s", row.email)

        threading.Thread(target=_bg_sync, daemon=True).start()


def _warmup_llm_model() -> None:
    """Preload the configured Ollama model into RAM at startup.

    Best-effort: if Ollama isn't running or the model isn't installed we just
    log and move on — the UI status indicator will reflect the state and the
    user can retry from the sidebar. Runs in a background thread so startup is
    never blocked by the (potentially slow) model load.
    """
    from . import llm_triage
    from .routes.triage import _set_warmup

    def _bg_warmup() -> None:
        try:
            with SessionLocal() as db:
                model = get_setting(db, "ollama_model")
                base_url = get_setting(db, "ollama_base_url")
            probe = llm_triage.test_connection(base_url)
            if not probe.get("ok"):
                _set_warmup(status="unavailable", model=model, error=probe.get("error"))
                log.info("Ollama not running at startup — triage will warm up on demand.")
                return
            if model not in probe.get("models", []):
                _set_warmup(status="unavailable", model=model,
                            error=f"Model '{model}' not installed on Ollama.")
                log.warning("Configured model '%s' not installed on Ollama.", model)
                return
            _set_warmup(status="loading", model=model, error=None)
            log.info("Warming up LLM model '%s'…", model)
            result = llm_triage.warmup_model(model, base_url)
            if result.get("ok"):
                _set_warmup(status="ready", model=model, error=None)
                log.info("LLM model '%s' is ready.", model)
            else:
                _set_warmup(status="unavailable", model=model, error=result.get("error"))
                log.warning("LLM warmup failed: %s", result.get("error"))
        except Exception:
            log.exception("LLM warmup on startup failed; continuing.")

    threading.Thread(target=_bg_warmup, daemon=True).start()


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("MailMind backend starting up…")
    init_db()
    with SessionLocal() as db:
        settings = get_all_settings(db)

    if settings.get("mock_mode"):
        try:
            seeded = mock_data.seed_mock(force=False)
            if seeded:
                log.info("Seeded %d mock emails for demo mode.", seeded)
        except Exception:
            log.exception("Mock seeding failed; continuing without demo data.")

    scheduler.start_scheduler()

    # Reconnect existing accounts (validate tokens, refresh, incremental sync).
    try:
        _reconnect_accounts()
    except Exception:
        log.exception("Account reconnect on startup failed; continuing.")

    # Preload the configured LLM model into RAM so the first scan is fast and
    # new mail is triaged without a cold-start delay. Runs in the background —
    # startup never blocks on model loading (which can take 10-60s).
    _warmup_llm_model()

    yield
    log.info("MailMind backend shutting down…")
    scheduler.shutdown_scheduler()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="MailMind", version="0.1.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(emails_router.router)
app.include_router(accounts_router.router)
app.include_router(sync_router.router)
app.include_router(triage_router.router)
app.include_router(settings_router.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "mailmind"}


# ---------------------------------------------------------------------------
# Serve the built SPA (single-process mode).
# Mounted LAST so API routes always take precedence.
# ---------------------------------------------------------------------------
if DIST_DIR.is_dir():
    log.info("Serving SPA from %s", DIST_DIR)
    app.mount("/", StaticFiles(directory=str(DIST_DIR), html=True), name="spa")
else:
    log.warning(
        "frontend/dist/ not found — SPA will not be served. "
        "Run 'npm run build' in frontend/ or use start.sh for dev mode."
    )
