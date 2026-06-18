"""Gmail OAuth2 flow and authenticated service construction.

Design
------
* ``start_oauth()`` runs the Google desktop OAuth flow with
  ``flow.run_local_server`` — it opens the user's browser, captures the
  redirect on a throwaway localhost port, and returns the resulting
  ``Credentials`` object. This is the cleanest UX for a single-user local app.
* Tokens are persisted (encrypted) to ``accounts.json`` via ``security.py`` and
  mirrored as ``Account`` rows in SQLite for fast querying.
* ``build_gmail_service()`` rebuilds a service from stored credentials and
  transparently refreshes expired access tokens. If a refresh fails the account
  is flagged ``needs_reauth`` so the UI can prompt the user.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from . import security
from .database import Account, SessionLocal

log = logging.getLogger("mailmind.accounts")

# Gmail OAuth scopes: metadata + labels + body + read/write for read-state sync.
SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.labels",
]

# A curated palette for account color dots. We cycle through it as accounts are
# added so each gets a visually distinct tag in the unified inbox.
ACCOUNT_COLORS = [
    "#60a5fa",  # blue-400
    "#34d399",  # emerald-400
    "#f472b6",  # pink-400
    "#fbbf24",  # amber-400
    "#a78bfa",  # violet-400
    "#22d3ee",  # cyan-400
    "#fb7185",  # rose-400
    "#a3e635",  # lime-400
]


def _credentials_path() -> Path:
    """Return the path to the user-supplied OAuth client secrets file."""
    here = Path(__file__).resolve().parent
    # Allow override via env for flexibility; default to backend/credentials.json
    env = os.environ.get("MAILMIND_CREDENTIALS_JSON")
    return Path(env) if env else here / "credentials.json"


def credentials_file_exists() -> bool:
    return _credentials_path().exists()


def _next_color(db: Session) -> str:
    count = db.query(Account).count()
    return ACCOUNT_COLORS[count % len(ACCOUNT_COLORS)]


# ---------------------------------------------------------------------------
# OAuth flow
# ---------------------------------------------------------------------------
def start_oauth_flow() -> dict[str, Any]:
    """Run the desktop OAuth consent flow and persist the new account.

    Opens the default browser for consent, blocks until the redirect is
    captured, then stores the (encrypted) token and creates an Account row.

    Returns a dict describing the new account.
    Raises FileNotFoundError if credentials.json is missing.
    """
    creds_path = _credentials_path()
    if not creds_path.exists():
        raise FileNotFoundError(
            f"Gmail OAuth credentials not found at {creds_path}. "
            "Download a Desktop OAuth client JSON from Google Cloud Console and "
            "place it there (see README)."
        )

    # Imported lazily so the rest of the app works without google-auth installed
    # until the moment we actually need OAuth.
    from google_auth_oauthlib.flow import InstalledAppFlow

    flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
    # port=0 lets the OS pick a free port for the local redirect server.
    creds: Credentials = flow.run_local_server(port=0, access_type="offline",
                                               prompt="consent", timeout_seconds=300)

    # Validate that we actually got a refresh_token. Without it the access token
    # will expire within the hour and the account can never reconnect — fail
    # loudly here rather than letting it silently break on the next sync.
    if not creds.refresh_token:
        raise RuntimeError(
            "Google did not return a refresh token. Re-add the account; if it "
            "still fails, revoke MailMind at myaccount.google.com/permissions "
            "first (the consent screen only issues refresh tokens on a fresh "
            "grant)."
        )

    profile = _fetch_profile(creds)
    email = profile.get("emailAddress")
    if not email:
        raise RuntimeError("Could not determine the Gmail address from the profile.")

    # Persist encrypted token.
    accounts = security.load_accounts_file()
    color = ACCOUNT_COLORS[0]
    with SessionLocal() as db:
        existing = db.query(Account).filter_by(email=email).first()
        if existing:
            color = existing.color
        else:
            color = _next_color(db)
        accounts[email] = {"token": _creds_to_dict(creds), "color": color}
        security.save_accounts_file(accounts)

        account = upsert_account_row(db, email, color, creds)

    # Inline historical pull: fetch the initial batch BEFORE returning so the
    # user actually sees mail (and gets a real success/failure) the moment they
    # connect — not a silent fire-and-forget. Counts come from settings.
    from . import gmail_sync
    from .database import SessionLocal as _SL, get_setting
    with _SL() as db:
        initial_count = int(get_setting(db, "initial_fetch_count"))
    try:
        with _SL() as db:
            fresh = db.get(Account, account.id)
            result = gmail_sync.initial_sync(fresh, initial_count)
    except Exception as exc:
        log.exception("Initial historical sync failed for %s", email)
        # The account is connected; we just couldn't pull history yet. Surface
        # it so the UI can tell the user to retry via "Sync now".
        return {**account.to_dict(), "initial_sync": {"fetched": 0, "error": str(exc)}}
    return {**account.to_dict(), "initial_sync": result}


def _fetch_profile(creds: Credentials) -> dict[str, Any]:
    """Hit ``users.getProfile`` to learn the address behind these credentials."""
    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        return service.users().getProfile(userId="me").execute()
    except HttpError as exc:  # pragma: no cover - network path
        log.warning("getProfile failed: %s", exc)
        return {}


def _creds_to_dict(creds: Credentials) -> dict[str, Any]:
    return {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes or []),
    }


def _dict_to_creds(d: dict[str, Any]) -> Credentials:
    return Credentials(
        token=d.get("token"),
        refresh_token=d.get("refresh_token"),
        token_uri=d.get("token_uri"),
        client_id=d.get("client_id"),
        client_secret=d.get("client_secret"),
        scopes=d.get("scopes"),
    )


# ---------------------------------------------------------------------------
# SQLite <-> accounts.json sync
# ---------------------------------------------------------------------------
def upsert_account_row(db: Session, email: str, color: str,
                       creds: Credentials) -> Account:
    account = db.query(Account).filter_by(email=email).first()
    if account is None:
        account = Account(email=email, color=color)
        db.add(account)
    else:
        account.color = color
    account.needs_reauth = False
    db.commit()
    db.refresh(account)
    return account


def load_credentials(db: Session, account: Account) -> Credentials | None:
    """Decrypt + return stored credentials for an account, or None if missing."""
    accounts = security.load_accounts_file()
    entry = accounts.get(account.email)
    if not entry:
        return None
    return _dict_to_creds(entry["token"])


def _persist_refreshed_credentials(account: Account, creds: Credentials) -> None:
    """Write an updated (post-refresh) access token back to accounts.json."""
    accounts = security.load_accounts_file()
    if account.email in accounts:
        accounts[account.email]["token"] = _creds_to_dict(creds)
        security.save_accounts_file(accounts)


# ---------------------------------------------------------------------------
# Service construction
# ---------------------------------------------------------------------------
class NeedsReauthError(Exception):
    """Raised when stored credentials can no longer be refreshed."""


def build_gmail_service(account: Account) -> Any:
    """Return an authenticated Gmail service for the given account.

    Refreshes the access token if expired. On ``RefreshError`` the account is
    flagged ``needs_reauth`` and ``NeedsReauthError`` is raised so callers can
    skip it gracefully.
    """
    with SessionLocal() as db:
        creds = load_credentials(db, account)
    if creds is None:
        raise NeedsReauthError(f"No stored credentials for {account.email}")

    if not creds.valid and creds.refresh_token:
        # Retry once on a transient refresh failure before declaring the
        # account dead — Google's token endpoint occasionally 500s.
        last_exc: Exception | None = None
        for attempt in range(2):
            try:
                creds.refresh(Request())
                _persist_refreshed_credentials(account, creds)
                last_exc = None
                break
            except RefreshError as exc:
                last_exc = exc
                log.warning("Refresh attempt %d failed for %s: %s",
                            attempt + 1, account.email, exc)
                if attempt == 0:
                    import time
                    time.sleep(1.5)
        if last_exc is not None:
            _flag_needs_reauth(account, True)
            raise NeedsReauthError(str(last_exc)) from last_exc

    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def _flag_needs_reauth(account: Account, value: bool) -> None:
    with SessionLocal() as db:
        row = db.get(Account, account.id)
        if row:
            row.needs_reauth = value
            db.commit()


def delete_account(account_id: int) -> bool:
    """Remove an account, its encrypted tokens, and its cached emails."""
    with SessionLocal() as db:
        account = db.get(Account, account_id)
        if account is None:
            return False
        email = account.email
        db.delete(account)
        # Cascade-delete the account's emails.
        from .database import Email
        db.query(Email).filter_by(account_id=account_id).delete()
        db.commit()

    accounts = security.load_accounts_file()
    accounts.pop(email, None)
    security.save_accounts_file(accounts)
    return True
