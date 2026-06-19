"""Account management endpoints (list / add via OAuth / delete)."""
from __future__ import annotations

import logging
import threading
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import accounts as accounts_mod
from .. import gmail_sync
from ..database import Account, get_db, get_setting
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
    """Run the desktop OAuth flow + inline historical sync.

    Blocks until consent is captured, then fetches the initial batch of
    historical emails synchronously. Returns the account dict plus an
    ``initial_sync`` summary with the number fetched (or an error).
    """
    try:
        account = accounts_mod.start_oauth_flow()
    except FileNotFoundError as exc:
        raise HTTPException(409, str(exc))  # credentials.json missing
    except Exception as exc:
        log.exception("OAuth flow failed")
        raise HTTPException(500, f"OAuth flow failed: {exc}")
    return {"account": account}


@router.post("/{account_id}/sync")
def trigger_sync(
    account_id: int,
    background: bool = Query(True),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Kick off a sync for one account.

    * ``background=false`` → runs synchronously, blocks until done or error.
      Used by callers that want a real fetched-count response.
    * ``background=true`` (default) → runs in a daemon thread, returns
      ``{"status": "started"}`` immediately.
    """
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")

    if account.email == MOCK_ACCOUNT_EMAIL:
        return {"status": "noop", "account": account.email}

    initial_count = int(get_setting(db, "initial_fetch_count"))
    email, account_id_local = account.email, account.id

    if not background:
        # Synchronous — caller wants a real result.
        from ..database import SessionLocal
        with SessionLocal() as s:
            acc = s.get(Account, account_id_local)
            if acc is None:
                raise HTTPException(404, "Account vanished during sync")
            try:
                result = gmail_sync.sync_account(acc, initial_count=initial_count)
            except Exception as exc:
                log.exception("Synchronous sync failed for %s", email)
                raise HTTPException(500, f"Sync failed: {exc}")
        # Best-effort auto-triage so the freshly-fetched emails get summaries.
        try:
            from ..triage_runner import run_triage_scan
            triage_summary = run_triage_scan(rescan=False, limit=500)
            result = {**result, "triage": triage_summary}
        except Exception:
            log.exception("Auto-triage after sync failed for %s", email)
        return {**result, "account": email}

    # Background — fire-and-forget with proper error handling.
    def _bg():
        from ..database import SessionLocal
        with SessionLocal() as s:
            acc = s.get(Account, account_id_local)
            if acc:
                try:
                    gmail_sync.sync_account(acc, initial_count=initial_count)
                except Exception:
                    log.exception("Background sync failed for %s", email)
                    return
                # Immediately triage the freshly-fetched emails so the UI can
                # surface AI summaries + importance ratings without a manual scan.
                try:
                    from ..triage_runner import run_triage_scan
                    run_triage_scan(rescan=False, limit=500)
                except Exception:
                    log.exception("Auto-triage after initial sync failed for %s", email)

    threading.Thread(target=_bg, daemon=True).start()
    return {"status": "started", "account": email}


@router.delete("/{account_id}")
def remove_account(account_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    account = db.get(Account, account_id)
    if account is None:
        raise HTTPException(404, "Account not found")
    ok = accounts_mod.delete_account(account_id)
    return {"deleted": ok, "id": account_id}
