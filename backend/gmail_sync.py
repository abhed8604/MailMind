"""Gmail fetch + incremental sync engine.

Two modes:

* ``initial_sync(account, max_results)`` — fetch the most recent N messages for
  an account and persist them. Used on first connect / on-demand reset.
* ``incremental_sync(account)`` — uses ``users.history.list`` with the stored
  ``historyId`` to fetch only changes since the last sync. Fast and cheap.

Both share a single ``_fetch_and_store`` routine that maps Gmail message dicts
into ``Email`` rows, including MIME multipart body extraction.

Rate limiting is handled by ``_with_backoff``: 429 responses are retried with
exponential delays (capped at 32s, max 5 attempts), per the spec.
"""
from __future__ import annotations

import base64
import datetime as _dt
import email.utils as eut
import logging
import time
from typing import Any, Callable

from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from .accounts import NeedsReauthError, build_gmail_service
from .database import Account, Email

log = logging.getLogger("mailmind.sync")

# Real users never need more than this; the cap protects against runaway loops.
MAX_BACKOFF_SECONDS = 32
MAX_RETRIES = 5
PAGE_SIZE = 100  # Gmail messages.list page size


# ---------------------------------------------------------------------------
# Backoff wrapper
# ---------------------------------------------------------------------------
def _with_backoff(func: Callable[[], Any]) -> Any:
    """Run a Gmail API call with exponential backoff on 429/503."""
    attempt = 0
    while True:
        try:
            return func()
        except HttpError as exc:
            status = exc.status_code if hasattr(exc, "status_code") else None
            retryable = status in (429, 503) or status is None
            if not retryable or attempt >= MAX_RETRIES:
                raise
            delay = min(MAX_BACKOFF_SECONDS, (2 ** attempt)) + 0.5
            retry_after = _retry_after_seconds(exc)
            sleep_for = retry_after if retry_after else delay
            log.warning("Gmail %s (attempt %d): backing off %.1fs", status, attempt + 1, sleep_for)
            time.sleep(sleep_for)
            attempt += 1


def _retry_after_seconds(exc: HttpError) -> float | None:
    hdrs = getattr(exc, "error", None)
    details = getattr(hdrs, "details", None) if hdrs else None
    # HttpError doesn't expose Retry-After reliably; return None to fall back
    # to exponential delay. Kept as a hook in case we want richer handling.
    return None


# ---------------------------------------------------------------------------
# MIME parsing
# ---------------------------------------------------------------------------
def _decode_part(data: str) -> str:
    """Decode a Gmail body payload (URL-safe base64) into a string."""
    pad = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + pad).decode("utf-8", errors="replace")


def _extract_bodies(payload: dict[str, Any]) -> tuple[str | None, str | None]:
    """Walk a message payload and return ``(html, text)`` bodies."""
    html: str | None = None
    text: str | None = None

    def walk(node: dict[str, Any]) -> None:
        nonlocal html, text
        mime = node.get("mimeType", "")
        body = node.get("body") or {}
        data = body.get("data")
        if mime == "text/html" and data and html is None:
            html = _decode_part(data)
        elif mime == "text/plain" and data and text is None:
            text = _decode_part(data)
        for part in node.get("parts", []) or []:
            walk(part)

    walk(payload)
    return html, text


def _parse_headers(headers: list[dict[str, str]]) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in headers or []}


def _parse_sender(raw: str) -> tuple[str | None, str | None]:
    """Split a 'From' header into ``(display_name, email)``."""
    if not raw:
        return None, None
    name, addr = eut.parseaddr(raw)
    return (name or None), (addr or None)


def _parse_date(raw: str | None) -> _dt.datetime | None:
    if not raw:
        return None
    try:
        tup = eut.parsedate_tz(raw)
        if tup is None:
            return None
        ts = eut.mktime_tz(tup)
        return _dt.datetime.fromtimestamp(ts, tz=_dt.timezone.utc)
    except (TypeError, OverflowError, ValueError):
        return None


def _snippet_from(text: str | None, html: str | None) -> str:
    src = text or _strip_html(html or "")
    if not src:
        return ""
    return " ".join(src.split())[:200]


def _strip_html(html: str) -> str:
    """Very small HTML stripper for the LLM prompt / snippet.

    We only need a flat text approximation here — DOMPurify handles safe
    rendering on the frontend. A regex strip is good enough for LLM input.
    """
    import re
    txt = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", html)
    txt = re.sub(r"(?s)<[^>]+>", " ", txt)
    txt = re.sub(r"\s+", " ", txt)
    return txt.strip()


# ---------------------------------------------------------------------------
# Single-message normalization
# ---------------------------------------------------------------------------
def _message_to_dict(msg: dict[str, Any]) -> dict[str, Any]:
    payload = msg.get("payload") or {}
    headers = _parse_headers(payload.get("headers") or [])
    html, text = _extract_bodies(payload)
    name, addr = _parse_sender(headers.get("from", ""))
    subject = headers.get("subject")
    snippet = msg.get("snippet") or _snippet_from(text, html)
    return {
        "gmail_message_id": msg.get("id"),
        "thread_id": msg.get("threadId"),
        "sender_name": name,
        "sender_email": addr,
        "subject": subject,
        "snippet": snippet,
        "body_html": html,
        "body_text": text or _strip_html(html or ""),
        "date": _parse_date(headers.get("date")),
        "is_read": "UNREAD" not in (msg.get("labelIds") or []),
        "is_starred": "STARRED" in (msg.get("labelIds") or []),
        "labels": msg.get("labelIds") or [],
    }


# ---------------------------------------------------------------------------
# Fetch + store
# ---------------------------------------------------------------------------
def _upsert_email(db: Session, account_id: int, fields: dict[str, Any]) -> Email:
    existing = (
        db.query(Email)
        .filter_by(account_id=account_id, gmail_message_id=fields["gmail_message_id"])
        .first()
    )
    if existing is None:
        email = Email(account_id=account_id, **_coerce_fields(fields))
        db.add(email)
    else:
        # Refresh mutable fields (read state, labels, body if it was empty).
        for k, v in _coerce_fields(fields).items():
            setattr(existing, k, v)
        email = existing
    return email


def _coerce_fields(fields: dict[str, Any]) -> dict[str, Any]:
    import json as _json
    out = dict(fields)
    labels = out.pop("labels", []) or []
    out["labels"] = _json.dumps(labels)
    return out


def _store_messages(db: Session, account: Account, message_ids: list[str],
                    service: Any) -> int:
    """Batch-fetch full messages by id and persist. Returns count stored."""
    import json as _json
    stored = 0
    for mid in message_ids:
        msg = _with_backoff(
            lambda m=mid: service.users()
            .messages()
            .get(userId="me", id=m, format="full")
            .execute()
        )
        fields = _message_to_dict(msg)
        _upsert_email(db, account.id, fields)
        stored += 1
        if stored % 25 == 0:
            db.commit()
    db.commit()
    return stored


def _list_messages(service: Any, max_results: int) -> list[str]:
    """Return up to ``max_results`` message ids (newest first)."""
    ids: list[str] = []
    page_token: str | None = None
    while len(ids) < max_results:
        limit = min(PAGE_SIZE, max_results - len(ids))
        req = service.users().messages().list(
            userId="me", maxResults=limit, pageToken=page_token
        )
        resp = _with_backoff(req.execute)
        ids.extend(m["id"] for m in resp.get("messages", []))
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return ids


# ---------------------------------------------------------------------------
# Public sync entrypoints
# ---------------------------------------------------------------------------
def initial_sync(account: Account, max_results: int) -> dict[str, Any]:
    """Full initial fetch of the most recent ``max_results`` messages."""
    service = build_gmail_service(account)
    ids = _list_messages(service, max_results)
    now = _dt.datetime.now(_dt.timezone.utc)
    count = 0
    with SessionLocal() as db:
        count = _store_messages(db, account, ids, service)
        _update_history_and_sync(db, account, service, now)
    log.info("initial_sync(%s): stored %d messages", account.email, count)
    return {"account": account.email, "fetched": count, "mode": "initial"}


def incremental_sync(account: Account) -> dict[str, Any]:
    """Fetch only changes since the last stored ``historyId``."""
    with SessionLocal() as db:
        db.refresh(account)
        since = account.history_id
        paused = account.paused

    if paused:
        return {"account": account.email, "fetched": 0, "mode": "skipped_paused"}

    service = build_gmail_service(account)
    now = _dt.datetime.now(_dt.timezone.utc)

    if not since:
        # No baseline yet — fall back to a small initial pull.
        with SessionLocal() as db:
            count = _store_messages(db, account, _list_messages(service, 50), service)
            _update_history_and_sync(db, account, service, now)
        return {"account": account.email, "fetched": count, "mode": "initial_fallback"}

    added: list[str] = []
    page_token: str | None = None
    while True:
        req = service.users().history().list(
            userId="me", startHistoryId=since, pageToken=page_token
        )
        resp = _with_backoff(req.execute)
        for hist in resp.get("history", []):
            for added_msg in hist.get("messagesAdded", []):
                msg = added_msg.get("message") or {}
                if msg.get("id"):
                    added.append(msg["id"])
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    # De-dupe + fetch.
    added = list(dict.fromkeys(added))
    with SessionLocal() as db:
        count = _store_messages(db, account, added, service)
        _update_history_and_sync(db, account, service, now)
    log.info("incremental_sync(%s): +%d messages", account.email, count)
    return {"account": account.email, "fetched": count, "mode": "incremental"}


def _update_history_and_sync(db: Session, account: Account, service: Any,
                             now: _dt.datetime) -> None:
    """Refresh the stored historyId (current mailbox state) + last_synced_at."""
    try:
        profile = _with_backoff(
            lambda: service.users().getProfile(userId="me").execute()
        )
        new_hist = profile.get("historyId")
        row = db.get(Account, account.id)
        if row:
            if new_hist:
                row.history_id = new_hist
            row.last_synced_at = now
            db.commit()
    except HttpError as exc:  # pragma: no cover
        log.warning("getProfile during sync failed for %s: %s", account.email, exc)


def sync_account(account: Account, *, initial_count: int | None = None) -> dict[str, Any]:
    """Decide initial vs incremental based on stored historyId."""
    try:
        if initial_count is not None:
            return initial_sync(account, initial_count)
        return incremental_sync(account)
    except NeedsReauthError as exc:
        log.warning("Skipping %s (needs reauth): %s", account.email, exc)
        return {"account": account.email, "fetched": 0, "mode": "needs_reauth",
                "error": str(exc)}
    except HttpError as exc:  # pragma: no cover
        log.exception("Gmail sync error for %s", account.email)
        return {"account": account.email, "fetched": 0, "mode": "error",
                "error": str(exc)}


def push_read_state(account: Account, gmail_message_id: str, *, read: bool) -> None:
    """Mirror read/unread changes back to Gmail."""
    try:
        service = build_gmail_service(account)
        action = {"removeLabelListIds": ["UNREAD"]} if read else {"addLabelListIds": ["UNREAD"]}
        _with_backoff(
            lambda: service.users()
            .messages()
            .modify(userId="me", id=gmail_message_id, body=action)
            .execute()
        )
    except NeedsReauthError:
        log.warning("Cannot push read state for %s — needs reauth.", account.email)
    except HttpError as exc:  # pragma: no cover
        log.warning("read-state push failed for %s: %s", account.email, exc)


def push_starred(account: Account, gmail_message_id: str, *, starred: bool) -> None:
    """Mirror star changes back to Gmail."""
    try:
        service = build_gmail_service(account)
        action = (
            {"addLabelListIds": ["STARRED"], "removeLabelListIds": []}
            if starred
            else {"addLabelListIds": [], "removeLabelListIds": ["STARRED"]}
        )
        _with_backoff(
            lambda: service.users()
            .messages()
            .modify(userId="me", id=gmail_message_id, body=action)
            .execute()
        )
    except NeedsReauthError:
        log.warning("Cannot push star state for %s — needs reauth.", account.email)
    except HttpError as exc:  # pragma: no cover
        log.warning("star-state push failed for %s: %s", account.email, exc)
