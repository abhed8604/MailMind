"""Triage endpoints: connection test, batch scan, single rescan, status."""
from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import llm_triage, triage_runner
from ..database import Email, get_db, get_setting

log = logging.getLogger("mailmind.routes.triage")
router = APIRouter(prefix="/triage", tags=["triage"])

# A module-level lock so only one scan runs at a time.
_SCAN_LOCK = threading.Lock()
_SCAN_STATE: dict[str, Any] = {"running": False, "summary": None}


@router.get("/connection")
def test_connection(db: Session = Depends(get_db)) -> dict[str, Any]:
    base_url = get_setting(db, "ollama_base_url")
    model = get_setting(db, "ollama_model")
    result = llm_triage.test_connection(base_url)
    result["configured_model"] = model
    result["model_available"] = model in result.get("models", [])
    return result


@router.post("/scan")
def start_scan(
    background: bool = Query(True),
    rescan: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=500),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Scan unscored (or all, if ``rescan``) emails.

    In mock mode the demo emails are already pre-scored, so a normal scan finds
    nothing new — the caller can pass ``rescan=true`` to re-triage live.
    """
    model = get_setting(db, "ollama_model")
    base_url = get_setting(db, "ollama_base_url")

    def _run():
        if not _SCAN_LOCK.acquire(blocking=False):
            log.info("Scan already running; ignoring new request.")
            return
        _SCAN_STATE["running"] = True
        try:
            summary = triage_runner.run_triage_scan(
                rescan=rescan, limit=limit, model=model, base_url=base_url
            )
            _SCAN_STATE["summary"] = summary
        finally:
            _SCAN_STATE["running"] = False
            _SCAN_LOCK.release()

    if background:
        threading.Thread(target=_run, daemon=True).start()
        return {"status": "started"}
    _run()
    return {"status": "done", "summary": _SCAN_STATE.get("summary")}


@router.get("/status")
def scan_status() -> dict[str, Any]:
    return dict(_SCAN_STATE)


@router.post("/email/{email_id}")
def rescan_email(email_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Email, email_id)
    if row is None:
        raise HTTPException(404, "Email not found")
    model = get_setting(db, "ollama_model")
    base_url = get_setting(db, "ollama_base_url")
    summary = triage_runner.run_triage_scan(
        email_ids=[email_id], rescan=True, model=model, base_url=base_url
    )
    db.refresh(row)
    return {"summary": summary, "email": row.to_dict()}
