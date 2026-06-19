"""Bridge between ``llm_triage`` and the database.

The pure ``llm_triage`` module talks to Ollama and returns ``TriageResult``s
without knowing about SQLAlchemy. This module picks unscored emails from the DB,
runs them through the model, writes results back, and returns a summary. Used by
both the manual "Scan for Important Emails" endpoint and the scheduler's
auto-scan.
"""
from __future__ import annotations

import datetime as _dt
import logging
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import llm_triage
from .database import Email, SessionLocal, get_setting

log = logging.getLogger("mailmind.triage_runner")

# Hard cap on how many emails a single scan/rescan will touch. Keeps runs
# predictable and bounded; never-scanned emails are prioritized within the cap.
MAX_SCAN_LIMIT = 100


def _pick_emails(db: Session, *, rescan: bool, limit: int | None) -> list[Email]:
    """Return emails to triage, capped at ``MAX_SCAN_LIMIT``.

    Priority order within the cap:
      1. Emails that have never been scanned (``scanned_at IS NULL``), newest first.
      2. Remaining slots (up to the cap) filled with the latest already-scanned emails.

    A normal (non-rescan) scan only considers never-scanned emails; a rescan
    also re-triages previously-scored ones to fill the cap.
    """
    cap = min(limit or MAX_SCAN_LIMIT, MAX_SCAN_LIMIT)

    # Never-scanned emails first (priority), newest first.
    never_scanned = list(db.scalars(
        select(Email)
        .where(Email.scanned_at.is_(None))
        .order_by(Email.date.desc().nullslast())
        .limit(cap)
    ))

    if not rescan:
        return never_scanned

    # Rescan: fill any remaining slots with the latest already-scanned emails.
    remaining = cap - len(never_scanned)
    if remaining <= 0:
        return never_scanned

    fill = list(db.scalars(
        select(Email)
        .where(Email.scanned_at.is_not(None))
        .order_by(Email.date.desc().nullslast())
        .limit(remaining)
    ))
    return never_scanned + fill


def run_triage_scan(
    *,
    rescan: bool = False,
    limit: int | None = None,
    email_ids: list[int] | None = None,
    model: str | None = None,
    base_url: str | None = None,
    batch_size: int = 10,
    on_progress: Callable[[int, int], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    """Scan emails with the configured Ollama model and persist results.

    Returns a summary like:
        {"scanned": 8, "important": 3, "errors": 0, "model": "...",
         "unavailable": false, "error": None, "total": 20, "cancelled": false}

    If Ollama is unreachable, ``unavailable=True`` and no emails are touched.

    The optional ``on_progress(scanned_so_far, total)`` callback is invoked after
    each email so callers can report real-time progress.

    The optional ``cancel_check`` callable is polled between batches; if it
    returns True the scan stops after the current batch (soft-cancel).
    """
    with SessionLocal() as db:
        if email_ids:
            emails = list(db.scalars(select(Email).where(Email.id.in_(email_ids))))
        else:
            emails = _pick_emails(db, rescan=rescan, limit=limit)

        if not model:
            model = get_setting(db, "ollama_model")
        if not base_url:
            base_url = get_setting(db, "ollama_base_url")

        total = len(emails)

        if not emails:
            return {"scanned": 0, "important": 0, "errors": 0, "model": model,
                    "unavailable": False, "error": None, "total": 0, "cancelled": False}

        # Build lightweight payloads — only the fields the LLM prompt needs.
        # This avoids loading body_html (the heaviest field) into RAM.
        payloads = [
            {
                "id": e.id,
                "subject": e.subject or "",
                "sender_name": e.sender_name or "",
                "sender_email": e.sender_email or "",
                "body_text": (e.body_text or "")[:1500],
            }
            for e in emails
        ]

    # Run the batch outside the DB session (each triage call is slow).
    scanned = important = errors = 0
    unavailable = False
    cancelled = False
    last_error: str | None = None

    for i in range(0, len(payloads), batch_size):
        # Soft-cancel: checked before starting each new batch.
        if cancel_check and cancel_check():
            cancelled = True
            log.info("triage scan cancelled by user after %d/%d.", scanned, total)
            break
        chunk = payloads[i:i + batch_size]
        for eid, result, err in llm_triage.scan_batch(
            chunk, model=model, base_url=base_url
        ):
            if result is None:
                errors += 1
                last_error = err
                if err and "Ollama unavailable" in str(err):
                    unavailable = True
                if unavailable:
                    # Ollama is down — abort the run cleanly.
                    break
                scanned += 1
                if on_progress:
                    on_progress(scanned, total)
                continue
            with SessionLocal() as db:
                row = db.get(Email, eid)
                if row is not None:
                    row.important = result.important
                    row.importance_score = result.score
                    row.importance_reason = result.reason
                    row.category = result.category
                    row.action_required = result.action_required
                    row.ai_summary = result.summary
                    row.scanned_at = _dt.datetime.now(_dt.timezone.utc)
                    row.scan_model = model
                    db.commit()
            scanned += 1
            if result.important:
                important += 1
            if on_progress:
                on_progress(scanned, total)
        if unavailable:
            break

    summary = {
        "scanned": scanned,
        "important": important,
        "errors": errors,
        "model": model,
        "unavailable": unavailable,
        "cancelled": cancelled,
        "error": last_error,
        "total": total,
    }
    log.info("triage scan: %s", summary)
    return summary
