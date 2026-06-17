"""Account management endpoints (list / add via OAuth / delete)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import accounts as accounts_mod
from .. import gmail_sync
from ..database import Account, get_db, get_setting, set_setting
from ..mock_data import MOCK_ACCOUNT_EMAIL

log = logging.getLogger("mailmind.routes.accounts")
router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def list_accounts(db: Session = Depends(get_db)) -> dict[str, Any]:
    rows = db.query(Account).order_by(Account.created_at).all()
    return {
        "accounts": [r.to_dict() for r in rows],
        "credentials_configured": accounts_mod.credentials_file_exists(),
        "mock_account": MOCK_ACCOUNT_EMAIL,
    }


@router.post("/oauth/start")
def start_oauth() -> dict[str, Any]:
    """Run the desktop OAuth flow (opens browser, blocks until complete)."""
    try:
        account = accounts_mod.start_oauth_flow()
    except FileNotFoundError as exc:
        raise HTTPException(409, str(exc))  # credentials.json missing
    except Exception as exc:  # pragma: no cover - OAuth edge cases
        log.exception("OAuth flow failed")
        raise HTTPException(500, f"OAuth flow failed: {exc}")
    return {"account": account}


@router.post("/{account_id}/sync")
def trigger_sync(account_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Kick off an initial/partial sync for one account in the background."""
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")

    initial_count = get_setting(db, "initial_fetch_count")
    # Detach attributes we need before the session closes.
    email, account_id_local = account.email, account.id

    import threading
    # Re-fetch a fresh ORM object inside the background thread's own session.
    def _bg():
        from ..database import SessionLocal
        with SessionLocal() as s:
            acc = s.get(Account, account_id_local)
            if acc:
                gmail_sync.sync_account(acc, initial_count=initial_count)
    threading.Thread(target=_bg, daemon=True).start()
    return {"status": "started", "account": email}


@router.delete("/{account_id}")
def remove_account(account_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    ok = accounts_mod.delete_account(account_id)
    return {"deleted": ok, "id": account_id}
