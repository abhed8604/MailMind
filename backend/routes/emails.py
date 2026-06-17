"""Email list / detail / mutation endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..database import Email, get_db, get_setting
from .. import gmail_sync, mock_data
from ..accounts import NeedsReauthError

router = APIRouter(prefix="/emails", tags=["emails"])

PAGE_SIZE = 50


class EmailPatch(BaseModel):
    is_read: bool | None = None
    is_starred: bool | None = None


def _account_of(db: Session, email: Email):
    from ..database import Account
    return db.get(Account, email.account_id)


@router.get("")
def list_emails(
    filter: str = Query("all", pattern="^(all|unread|important|starred)$"),
    q: str | None = None,
    account_id: int | None = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Unified inbox query.

    * ``filter`` — all | unread | important | starred
    * ``q``      — substring match across sender/subject/snippet
    * Pagination is 50/page; returns total count for the UI.
    """
    threshold = get_setting(db, "importance_threshold")

    stmt = select(Email)
    if filter == "unread":
        stmt = stmt.where(Email.is_read.is_(False))
    elif filter == "important":
        stmt = stmt.where(Email.important.is_(True)).order_by(
            Email.importance_score.desc().nullslast()
        )
    elif filter == "starred":
        stmt = stmt.where(Email.is_starred.is_(True))

    if account_id is not None:
        stmt = stmt.where(Email.account_id == account_id)

    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(
                Email.subject.ilike(like),
                Email.sender_name.ilike(like),
                Email.sender_email.ilike(like),
                Email.snippet.ilike(like),
            )
        )

    # Default ordering is date desc, unless "important" already ordered by score.
    if filter != "important":
        stmt = stmt.order_by(Email.date.desc().nullslast())

    # total count for pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(db.execute(count_stmt).scalar() or 0)

    offset = (page - 1) * PAGE_SIZE
    rows = list(db.scalars(stmt.offset(offset).limit(PAGE_SIZE)))

    return {
        "emails": [r.to_dict() for r in rows],
        "page": page,
        "page_size": PAGE_SIZE,
        "total": total,
        "total_pages": (total + PAGE_SIZE - 1) // PAGE_SIZE if total else 0,
        "importance_threshold": threshold,
    }


@router.get("/{email_id}")
def get_email(email_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Email, email_id)
    if row is None:
        raise HTTPException(404, "Email not found")
    return row.to_dict()


@router.patch("/{email_id}")
def patch_email(email_id: int, patch: EmailPatch,
                db: Session = Depends(get_db)) -> dict[str, Any]:
    row = db.get(Email, email_id)
    if row is None:
        raise HTTPException(404, "Email not found")

    changed_read = changed_star = False
    if patch.is_read is not None and patch.is_read != row.is_read:
        row.is_read = patch.is_read
        changed_read = True
    if patch.is_starred is not None and patch.is_starred != row.is_starred:
        row.is_starred = patch.is_starred
        changed_star = True
    db.commit()

    # Best-effort push back to Gmail for real accounts (skip the demo account).
    account = _account_of(db, row)
    if account and account.email != mock_data.MOCK_ACCOUNT_EMAIL:
        if changed_read:
            try:
                gmail_sync.push_read_state(account, row.gmail_message_id, read=row.is_read)
            except Exception:  # pragma: no cover - best effort
                pass
        if changed_star:
            try:
                gmail_sync.push_starred(account, row.gmail_message_id, starred=row.is_starred)
            except Exception:  # pragma: no cover - best effort
                pass

    return row.to_dict()
