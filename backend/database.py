"""SQLAlchemy database setup, models, and session management.

The SQLite database lives at ``~/.mailmind/mailmind.db``. All app state that is
not OAuth tokens (which are encrypted separately in ``accounts.json``) lives
here: accounts, emails, and a key/value settings table.
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
import os
from pathlib import Path
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    create_engine,
    inspect,
    select,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    sessionmaker,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
MAILMIND_DIR = Path(os.path.expanduser("~/.mailmind"))
MAILMIND_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = MAILMIND_DIR / "mailmind.db"
DB_URL = f"sqlite:///{DB_PATH}"

# ---------------------------------------------------------------------------
# Engine + session
# ---------------------------------------------------------------------------
engine = create_engine(DB_URL, future=True, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db() -> Session:
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
def _utcnow() -> _dt.datetime:
    return _dt.datetime.now(_dt.timezone.utc)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    color: Mapped[str] = mapped_column(String(16), default="#60a5fa")  # tailwind blue-400
    history_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    needs_reauth: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "color": self.color,
            "paused": self.paused,
            "needs_reauth": self.needs_reauth,
            "last_synced_at": self.last_synced_at.isoformat() if self.last_synced_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    gmail_message_id: Mapped[str] = mapped_column(String(64), index=True)
    thread_id: Mapped[str] = mapped_column(String(64), index=True)

    sender_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    sender_email: Mapped[str | None] = mapped_column(String(255), index=True)
    subject: Mapped[str | None] = mapped_column(Text, nullable=True)
    snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_html: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    date: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    labels: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON list

    # Triage fields (filled by llm_triage)
    important: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    importance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    importance_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    action_required: Mapped[bool] = mapped_column(Boolean, default=False)
    scanned_at: Mapped[_dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scan_model: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    synced_at: Mapped[_dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "account_id": self.account_id,
            "gmail_message_id": self.gmail_message_id,
            "thread_id": self.thread_id,
            "sender_name": self.sender_name,
            "sender_email": self.sender_email,
            "subject": self.subject,
            "snippet": self.snippet,
            "body_html": self.body_html,
            "body_text": self.body_text,
            "date": self.date.isoformat() if self.date else None,
            "is_read": self.is_read,
            "is_starred": self.is_starred,
            "labels": json.loads(self.labels) if self.labels else [],
            "important": self.important,
            "importance_score": self.importance_score,
            "importance_reason": self.importance_reason,
            "category": self.category,
            "action_required": self.action_required,
            "scanned_at": self.scanned_at.isoformat() if self.scanned_at else None,
            "scan_model": self.scan_model,
            "ai_summary": self.ai_summary,
            "synced_at": self.synced_at.isoformat() if self.synced_at else None,
        }

    def to_list_dict(self) -> dict[str, Any]:
        """Lightweight shape for the inbox list endpoint.

        Omits the heavy ``body_html`` / ``body_text`` fields (which can each be
        tens of KB and are only needed when an email is opened) and adds a short
        ``preview`` derived from the body — enough for a 2–4 line row summary.
        Everything else mirrors :meth:`to_dict`.
        """
        body = (self.body_text or "").strip()
        preview = body[:400] if body else (self.snippet or "")
        return {
            "id": self.id,
            "account_id": self.account_id,
            "gmail_message_id": self.gmail_message_id,
            "thread_id": self.thread_id,
            "sender_name": self.sender_name,
            "sender_email": self.sender_email,
            "subject": self.subject,
            "snippet": self.snippet,
            "preview": preview,
            "date": self.date.isoformat() if self.date else None,
            "is_read": self.is_read,
            "is_starred": self.is_starred,
            "labels": json.loads(self.labels) if self.labels else [],
            "important": self.important,
            "importance_score": self.importance_score,
            "importance_reason": self.importance_reason,
            "category": self.category,
            "action_required": self.action_required,
            "scanned_at": self.scanned_at.isoformat() if self.scanned_at else None,
            "scan_model": self.scan_model,
            "ai_summary": self.ai_summary,
            "synced_at": self.synced_at.isoformat() if self.synced_at else None,
        }


class Setting(Base):
    """Simple key/value store for app configuration."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)

    def to_dict(self) -> dict[str, Any]:
        return {"key": self.key, "value": self.value}


# ---------------------------------------------------------------------------
# Settings helpers (typed get/set over the key/value table)
# ---------------------------------------------------------------------------
DEFAULT_SETTINGS: dict[str, Any] = {
    "sync_interval_minutes": 5,
    "initial_fetch_count": 500,
    "ollama_base_url": "http://localhost:11434",
    "ollama_model": "hf.co/unsloth/gemma-4-E2B-it-GGUF:IQ4_XS",
    "auto_scan": True,
    "importance_threshold": 7,
    "mock_mode": True,
    "dark_mode": True,
}

# Coerce stored string values back into their native types.
_SETTING_TYPES = {
    "sync_interval_minutes": int,
    "initial_fetch_count": int,
    "ollama_base_url": str,
    "ollama_model": str,
    "auto_scan": lambda v: str(v).lower() in ("1", "true", "yes"),
    "importance_threshold": int,
    "mock_mode": lambda v: str(v).lower() in ("1", "true", "yes"),
    "dark_mode": lambda v: str(v).lower() in ("1", "true", "yes"),
}


def _coerce(key: str, raw: str) -> Any:
    caster = _SETTING_TYPES.get(key, str)
    try:
        return caster(raw)
    except (TypeError, ValueError):
        return DEFAULT_SETTINGS.get(key)


def get_setting(db: Session, key: str) -> Any:
    row = db.get(Setting, key)
    if row is None:
        return DEFAULT_SETTINGS.get(key)
    return _coerce(key, row.value)


def get_all_settings(db: Session) -> dict[str, Any]:
    merged = dict(DEFAULT_SETTINGS)
    for row in db.execute(select(Setting)).scalars():
        merged[row.key] = _coerce(row.key, row.value)
    return merged


def set_setting(db: Session, key: str, value: Any) -> Any:
    stored = "true" if value is True else ("false" if value is False else str(value))
    row = db.get(Setting, key)
    if row is None:
        row = Setting(key=key, value=stored)
        db.add(row)
    else:
        row.value = stored
    db.commit()
    return _coerce(key, stored)


def init_db() -> None:
    """Create tables (idempotent) and run lightweight migrations."""
    Base.metadata.create_all(bind=engine)

    # Lightweight migration: add ai_summary column if missing (existing DBs).
    _log = logging.getLogger("mailmind.db")
    try:
        insp = inspect(engine)
        email_cols = {c["name"] for c in insp.get_columns("emails")}
        if "ai_summary" not in email_cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE emails ADD COLUMN ai_summary TEXT"))
            _log.info("Migration: added ai_summary column to emails table.")
        if "action_required" not in email_cols:
            with engine.begin() as conn:
                conn.execute(
                    text("ALTER TABLE emails ADD COLUMN action_required BOOLEAN DEFAULT 0")
                )
            _log.info("Migration: added action_required column to emails table.")
    except Exception as exc:
        _log.warning("Migration check failed (non-fatal): %s", exc)
