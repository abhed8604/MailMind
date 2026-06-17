"""MailMind FastAPI application.

Startup responsibilities:
  * create tables + seed default settings
  * auto-seed mock data when ``mock_mode`` is on and the DB is empty
  * register all routers and start the background sync scheduler
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import mock_data, scheduler
from .database import SessionLocal, get_all_settings, init_db
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
        except Exception:  # pragma: no cover - seeding must never block startup
            log.exception("Mock seeding failed; continuing without demo data.")
    scheduler.start_scheduler()
    yield
    log.info("MailMind backend shutting down…")
    scheduler.shutdown_scheduler()


app = FastAPI(title="MailMind", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
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
