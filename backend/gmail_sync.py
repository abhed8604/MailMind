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
from .database import Account, Email, SessionLocal

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
    """Batch-fetch full messages by id and persist. Returns count stored.

    A single message failing (transient 5xx, deleted between list+get, etc.)
    is logged and skipped — it must NOT abort the whole batch, otherwise one
    bad message out of 500 would lose the other 499.
    """
    stored = 0
    for mid in message_ids:
        try:
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
        except HttpError as exc:
            log.warning("Skipping message %s for %s: %s", mid, account.email, exc)
            db.rollback()  # drop any partial state for this message
            continue
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
    account_id = account.id
    with SessionLocal() as db:
        fresh = db.get(Account, account_id)
        if fresh is None:
            return {"account": account.email, "fetched": 0, "mode": "account_missing"}
        since = fresh.history_id
        paused = fresh.paused

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
    # Track label-state changes (read/starred) per gmail message id so we can
    # reconcile the local DB with changes made in Gmail or on another device.
    # Each value is the set of label operations to apply. label_changes[id] =
    # {"add": set(), "remove": set()} accumulated across all history records.
    label_changes: dict[str, dict[str, set]] = {}
    page_token: str | None = None
    while True:
        req = service.users().history().list(
            userId="me", startHistoryId=since, pageToken=page_token,
            # Request label-change history in addition to new-message history.
            # Without historyTypes the API may still return them, but being
            # explicit guarantees labelChanged records are included.
            historyTypes=["messageAdded", "labelAdded", "labelRemoved"],
        )
        resp = _with_backoff(req.execute)
        for hist in resp.get("history", []):
            # New messages.
            for added_msg in hist.get("messagesAdded", []):
                msg = added_msg.get("message") or {}
                if msg.get("id"):
                    added.append(msg["id"])
            # Label added (e.g. user marked as read -> UNREAD removed, or
            # starred -> STARRED added). Gmail splits these into two record
            # types: labelAdded and labelRemoved.
            for ch in hist.get("labelsAdded", []):
                msg = ch.get("message") or {}
                mid = msg.get("id")
                if not mid:
                    continue
                labels = ch.get("labelIds") or []
                entry = label_changes.setdefault(mid, {"add": set(), "remove": set()})
                for lbl in labels:
                    entry["add"].add(lbl)
                    entry["remove"].discard(lbl)
            for ch in hist.get("labelsRemoved", []):
                msg = ch.get("message") or {}
                mid = msg.get("id")
                if not mid:
                    continue
                labels = ch.get("labelIds") or []
                entry = label_changes.setdefault(mid, {"add": set(), "remove": set()})
                for lbl in labels:
                    entry["remove"].add(lbl)
                    entry["add"].discard(lbl)
        page_token = resp.get("nextPageToken")
        if not page_token:
            break

    # De-dupe + fetch.
    added = list(dict.fromkeys(added))
    with SessionLocal() as db:
        count = _store_messages(db, account, added, service)
        # Reconcile read/starred state from label changes captured above.
        reconciled = _apply_label_changes(db, account, label_changes)
        _update_history_and_sync(db, account, service, now)
    log.info("incremental_sync(%s): +%d messages, %d label updates",
             account.email, count, reconciled)
    return {"account": account.email, "fetched": count,
            "label_updates": reconciled, "mode": "incremental"}


def _apply_label_changes(db: Session, account: Account,
                         label_changes: dict[str, dict[str, set]]) -> int:
    """Apply read/starred label changes captured from Gmail history to the
    local DB. Returns the number of locally-cached emails that were updated.

    This is what lets read/starred toggles made on another device (or directly
    in Gmail) propagate to this client: the periodic sync job calls
    incremental_sync, which now captures labelAdded/labelRemoved records and
    flows them through here.
    """
    if not label_changes:
        return 0
    # Map gmail message id -> local Email row for this account only.
    gmids = list(label_changes.keys())
    rows = db.query(Email).filter(
        Email.account_id == account.id,
        Email.gmail_message_id.in_(gmids),
    ).all()
    changed = 0
    for row in rows:
        ops = label_changes.get(row.gmail_message_id)
        if not ops:
            continue
        touched = False
        if "UNREAD" in ops["remove"] and not row.is_read:
            row.is_read = True
            touched = True
        elif "UNREAD" in ops["add"] and row.is_read:
            row.is_read = False
            touched = True
        if "STARRED" in ops["add"] and not row.is_starred:
            row.is_starred = True
            touched = True
        elif "STARRED" in ops["remove"] and row.is_starred:
            row.is_starred = False
            touched = True
        if touched:
            changed += 1
    if changed:
        db.commit()
    return changed



def _update_history_and_sync(db: Session, account: Account, service: Any,
                             now: _dt.datetime) -> None:
    """Refresh the stored historyId (current mailbox state) + last_synced_at.

    The historyId is essential — without it every future sync falls back to a
    full pull. If getProfile fails transiently we retry once; if it still fails
    we log loudly so the operator knows the next sync won't be incremental.
    """
    profile = None
    for attempt in range(2):
        try:
            profile = _with_backoff(
                lambda: service.users().getProfile(userId="me").execute()
            )
            break
        except HttpError as exc:
            if attempt == 0:
                log.warning("getProfile attempt 1 failed for %s: %s; retrying",
                            account.email, exc)
                continue
            log.error("getProfile failed twice for %s — historyId NOT updated. "
                      "Next sync will not be incremental.", account.email)
            # Still record last_synced_at so the UI shows a recent attempt.
            row = db.get(Account, account.id)
            if row:
                row.last_synced_at = now
                db.commit()
            return

    new_hist = profile.get("historyId") if profile else None
    row = db.get(Account, account.id)
    if row:
        if new_hist:
            row.history_id = new_hist
        row.last_synced_at = now
        db.commit()


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
