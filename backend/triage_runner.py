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


def _pick_emails(db: Session, *, rescan: bool, limit: int | None) -> list[Email]:
    """Return emails to triage.

    By default only emails that have never been scanned (``scanned_at IS NULL``)
    are picked. With ``rescan=True`` all emails (in the current filter) are
    eligible — used by the explicit "rescan everything" action.
    """
    q = select(Email)
    if not rescan:
        q = q.where(Email.scanned_at.is_(None))
    q = q.order_by(Email.date.desc().nullslast())
    if limit:
        q = q.limit(limit)
    return list(db.scalars(q))


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

        # Detach into plain dicts for the model-agnostic triage module.
        payloads = [e.to_dict() for e in emails]
        id_map = {e.id: e for e in emails}

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
