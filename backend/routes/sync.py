"""Manual sync trigger + status polling."""
from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import gmail_sync
from .. import scheduler
from ..database import Account, get_db, get_setting
from ..mock_data import MOCK_ACCOUNT_EMAIL

log = logging.getLogger("mailmind.routes.sync")
router = APIRouter(prefix="/sync", tags=["sync"])

_LOCK = threading.Lock()


@router.post("")
def trigger_sync(background: bool, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Sync all real, non-paused accounts. ``background=true`` runs async."""
    accounts = (
        db.query(Account)
        .filter(Account.email != MOCK_ACCOUNT_EMAIL)
        .filter(Account.paused.is_(False))
        .all()
    )
    ids = [a.id for a in accounts]

    if not ids:
        return {"status": "noop", "detail": "No active real accounts to sync."}

    initial_count = get_setting(db, "initial_fetch_count")

    def _run():
        from ..database import SessionLocal
        if not _LOCK.acquire(blocking=False):
            log.info("Sync already running; skipping manual trigger.")
            return
        try:
            for aid in ids:
                with SessionLocal() as s:
                    acc = s.get(Account, aid)
                    if acc:
                        gmail_sync.sync_account(acc, initial_count=initial_count)
        finally:
            _LOCK.release()

    if background:
        threading.Thread(target=_run, daemon=True).start()
        return {"status": "started", "account_ids": ids}
    _run()
    return {"status": "done", "account_ids": ids}


@router.get("/status")
def sync_status() -> dict[str, Any]:
    return scheduler.get_status()
