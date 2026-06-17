"""Settings get/put + destructive utilities (clear local data, reseed mock)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import Account, Email, get_all_settings, get_db, set_setting

router = APIRouter(prefix="/settings", tags=["settings"])

# Which keys the API will accept via PUT.
_EDITABLE = {
    "sync_interval_minutes", "initial_fetch_count", "ollama_base_url",
    "ollama_model", "auto_scan", "importance_threshold", "mock_mode",
    "dark_mode",
}


class SettingsUpdate(BaseModel):
    # All optional — partial update.
    sync_interval_minutes: int | None = None
    initial_fetch_count: int | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    auto_scan: bool | None = None
    importance_threshold: int | None = None
    mock_mode: bool | None = None
    dark_mode: bool | None = None


@router.get("")
def get_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    return get_all_settings(db)


@router.put("")
def update_settings(payload: SettingsUpdate,
                    db: Session = Depends(get_db)) -> dict[str, Any]:
    data = payload.model_dump(exclude_none=True)
    for key, value in data.items():
        if key in _EDITABLE:
            set_setting(db, key, value)

    # Side-effects of certain setting changes.
    if "sync_interval_minutes" in data:
        from .. import scheduler
        scheduler.reschedule(int(data["sync_interval_minutes"]))

    return get_all_settings(db)


@router.post("/clear-data")
def clear_local_data(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Wipe emails + accounts from SQLite but keep OAuth tokens.

    Per the spec this keeps account tokens, so we only delete the DB rows
    (Email + Account) but leave the encrypted accounts.json untouched.
    """
    email_count = db.query(Email).count()
    db.query(Email).delete()
    # We don't drop the mock account here either; the caller can re-add.
    deleted_accounts = db.query(Account).delete()
    db.commit()
    return {"cleared_emails": email_count, "cleared_accounts": deleted_accounts}
