"""Email list / detail / mutation endpoints."""
from __future__ import annotations

import datetime as _dt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, select, func
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
        stmt = stmt.where(Email.important.is_(True))
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

    stmt = stmt.order_by(Email.date.desc().nullslast())

    # total count for pagination
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(db.execute(count_stmt).scalar() or 0)

    offset = (page - 1) * PAGE_SIZE
    rows = list(db.scalars(stmt.offset(offset).limit(PAGE_SIZE)))

    return {
        "emails": [r.to_list_dict() for r in rows],
        "page": page,
        "page_size": PAGE_SIZE,
        "total": total,
        "total_pages": (total + PAGE_SIZE - 1) // PAGE_SIZE if total else 0,
        "importance_threshold": threshold,
    }


@router.get("/analytics")
def email_analytics(db: Session = Depends(get_db)) -> dict[str, Any]:
    """Aggregate analytics over all cached emails.

    Returns:
      * ``summary`` — total / read / unread / starred / important counts
      * ``categories`` — count per triage category
      * ``trend`` — email volume per day for the last 30 days
    """
    threshold = get_setting(db, "importance_threshold")

    total = int(db.execute(select(func.count()).select_from(Email)).scalar() or 0)
    read = int(db.execute(
        select(func.count()).select_from(Email).where(Email.is_read.is_(True))
    ).scalar() or 0)
    unread = total - read
    starred = int(db.execute(
        select(func.count()).select_from(Email).where(Email.is_starred.is_(True))
    ).scalar() or 0)
    important = int(db.execute(
        select(func.count()).select_from(Email).where(Email.important.is_(True))
    ).scalar() or 0)

    # Category distribution. Emails with no category yet count as "unscanned".
    cat_rows = db.execute(
        select(Email.category, func.count())
        .group_by(Email.category)
    ).all()
    categories: dict[str, int] = {}
    scanned_total = 0
    for cat, cnt in cat_rows:
        key = cat or "unscanned"
        categories[key] = categories.get(key, 0) + int(cnt or 0)
        if cat is not None:
            scanned_total += int(cnt or 0)
    categories.setdefault("unscanned", 0)

    # 30-day volume trend (by date, UTC). Uses SQLite's date() over the ISO
    # timestamp string so grouping by calendar day works without Python-side
    # date casting (which fails on SQLite's stored ISO format).
    since = _dt.datetime.now(_dt.timezone.utc) - _dt.timedelta(days=30)
    trend_rows = db.execute(
        select(func.date(Email.date).label("d"), func.count())
        .where(Email.date.is_not(None), Email.date >= since)
        .group_by("d")
        .order_by("d")
    ).all()
    by_day = {str(row[0]): int(row[1]) for row in trend_rows}

    # Fill every day in the range so the chart has no gaps.
    trend = []
    cur = (since).date()
    end = _dt.datetime.now(_dt.timezone.utc).date()
    while cur <= end:
        trend.append({"date": cur.isoformat(), "count": by_day.get(cur.isoformat(), 0)})
        cur += _dt.timedelta(days=1)

    return {
        "summary": {
            "total": total,
            "read": read,
            "unread": unread,
            "starred": starred,
            "important": important,
            "scanned": scanned_total,
        },
        "categories": categories,
        "trend": trend,
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
