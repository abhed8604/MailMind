"""Triage endpoints: connection test, batch scan, single rescan, status."""
from __future__ import annotations

import logging
import threading
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import llm_triage, triage_runner, triage_rules
from ..database import Email, get_db, get_setting, set_setting

log = logging.getLogger("mailmind.routes.triage")
router = APIRouter(prefix="/triage", tags=["triage"])

# A module-level lock so only one scan runs at a time.
_SCAN_LOCK = threading.Lock()
_SCAN_STATE: dict[str, Any] = {
    "running": False,
    "total": 0,        # emails queued for this scan
    "scanned": 0,      # emails processed so far
    "summary": None,
}
# Set to True to request a soft-cancel of the running scan (checked between
# batches). Cleared at the start of each new scan.
_CANCEL_FLAG = threading.Event()


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
        _CANCEL_FLAG.clear()
        _SCAN_STATE["running"] = True
        _SCAN_STATE["total"] = 0
        _SCAN_STATE["scanned"] = 0
        _SCAN_STATE["summary"] = None
        try:
            def _on_progress(done: int, total: int) -> None:
                _SCAN_STATE["scanned"] = done
                _SCAN_STATE["total"] = total

            summary = triage_runner.run_triage_scan(
                rescan=rescan, limit=limit, model=model, base_url=base_url,
                on_progress=_on_progress, cancel_check=_CANCEL_FLAG.is_set,
            )
            _SCAN_STATE["summary"] = summary
            _SCAN_STATE["scanned"] = summary.get("scanned", _SCAN_STATE["scanned"])
            _SCAN_STATE["total"] = summary.get("total", _SCAN_STATE["total"])
        finally:
            _SCAN_STATE["running"] = False
            _SCAN_LOCK.release()

    if background:
        threading.Thread(target=_run, daemon=True).start()
        return {"status": "started"}
    _run()
    return {"status": "done", "summary": _SCAN_STATE.get("summary")}


@router.post("/cancel")
def cancel_scan() -> dict[str, Any]:
    """Request a soft-cancel of the running scan.

    The scan stops after the current batch completes; already-scored emails keep
    their results. Returns 200 even if no scan is running.
    """
    _CANCEL_FLAG.set()
    return {"status": "cancelling"}


@router.get("/status")
def scan_status() -> dict[str, Any]:
    state = dict(_SCAN_STATE)
    state["cancel_requested"] = _CANCEL_FLAG.is_set()
    return state


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


# ---------------------------------------------------------------------------
# Custom triage rules (editable .md file)
# ---------------------------------------------------------------------------
class RulesBody(BaseModel):
    rules: str


@router.get("/rules")
def get_rules() -> dict[str, Any]:
    return {"rules": triage_rules.load_rules()}


@router.put("/rules")
def put_rules(body: RulesBody) -> dict[str, Any]:
    return {"rules": triage_rules.save_rules(body.rules)}


# ---------------------------------------------------------------------------
# Model switching: delete the old model, pull the new one, update settings
# ---------------------------------------------------------------------------
class ModelBody(BaseModel):
    model: str


@router.post("/model")
def switch_model(body: ModelBody, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Swap the configured Ollama model.

    Deletes the currently-configured model (to free disk) and pulls the new one.
    Both calls can be slow, especially the pull (downloading several GB), so the
    route has a long timeout. On success the ``ollama_model`` setting is updated.
    """
    new_model = (body.model or "").strip()
    if not new_model:
        raise HTTPException(400, "Model name is required.")

    base_url = get_setting(db, "ollama_base_url")
    base = base_url.rstrip("/")
    old_model = get_setting(db, "ollama_model")

    # 1. Delete the old model (best-effort — ignore errors if it's missing).
    if old_model and old_model != new_model:
        try:
            httpx.post(
                f"{base}/api/delete",
                json={"name": old_model},
                timeout=30.0,
            )
            log.info("Deleted old model %s", old_model)
        except Exception as exc:
            log.warning("Could not delete old model %s: %s", old_model, exc)

    # 2. Pull the new model. This can take many minutes for multi-GB downloads.
    try:
        with httpx.stream(
            "POST",
            f"{base}/api/pull",
            json={"name": new_model, "stream": False},
            timeout=httpx.Timeout(connect=10.0, read=1800.0, write=30.0, pool=30.0),
        ) as resp:
            resp.raise_for_status()
            # Consume the body so the request completes.
            for _ in resp.iter_lines():
                pass
    except httpx.ConnectError as exc:
        raise HTTPException(503, f"Ollama unreachable at {base}: {exc}") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            exc.response.status_code,
            f"Ollama pull failed for '{new_model}': {exc.response.text[:200]}",
        ) from exc
    except Exception as exc:
        raise HTTPException(500, f"Pull failed: {exc}") from exc

    # 3. Persist the new model name.
    set_setting(db, "ollama_model", new_model)
    log.info("Switched Ollama model %s -> %s", old_model, new_model)
    return {"status": "switched", "old_model": old_model, "model": new_model}
