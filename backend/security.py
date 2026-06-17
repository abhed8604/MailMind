"""Secret storage for Gmail OAuth tokens.

The Fernet symmetric key is kept in the OS secret store (GNOME Keyring on most
Linux desktops via the ``keyring`` library). Encrypted token blobs live in the
plaintext ``~/.mailmind/accounts.json`` — safe to back up, useless without the
key in the keyring.

If no usable backend is found (e.g. headless server with no keyring daemon) we
fall back to a keyfile at ``~/.mailmind/master.key`` with restrictive
permissions and a loud warning. That keeps the app working, but the keyring
case is the secure path the spec asked for.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from .database import MAILMIND_DIR

log = logging.getLogger("mailmind.security")

ACCOUNTS_FILE = MAILMIND_DIR / "accounts.json"
KEYFILE = MAILMIND_DIR / "master.key"
_KEYRING_SERVICE = "mailmind"
_KEYRING_USER = "fernet-key"

# Set lazily so import never fails even on a headless box.
_fernet: Fernet | None = None
_keyring_available: bool | None = None


# ---------------------------------------------------------------------------
# Key acquisition
# ---------------------------------------------------------------------------
def _keyring_get() -> str | None:
    global _keyring_available
    if _keyring_available is False:
        return None
    try:
        import keyring  # type: ignore
    except Exception:  # pragma: no cover - import guard
        _keyring_available = False
        return None
    try:
        return keyring.get_password(_KEYRING_SERVICE, _KEYRING_USER)
    except Exception as exc:  # pragma: no cover - depends on backend
        log.warning("keyring backend unavailable (%s); falling back to keyfile", exc)
        _keyring_available = False
        return None


def _keyring_set(value: str) -> bool:
    try:
        import keyring  # type: ignore
    except Exception:
        return False
    try:
        keyring.set_password(_KEYRING_SERVICE, _KEYRING_USER, value)
        _keyring_available = True
        return True
    except Exception as exc:  # pragma: no cover
        log.warning("could not write to keyring (%s); falling back to keyfile", exc)
        return False


def _keyfile_read() -> str | None:
    if KEYFILE.exists():
        return KEYFILE.read_text().strip()
    return None


def _keyfile_write(value: str) -> None:
    KEYFILE.write_text(value)
    try:
        os.chmod(KEYFILE, 0o600)
    except OSError:  # pragma: no cover
        pass


def _load_or_create_key() -> str:
    """Return the Fernet key, generating + persisting it on first use."""
    # 1. Try the OS keyring first.
    key = _keyring_get()
    if key:
        return key

    # 2. Fall back to a keyfile if one already exists.
    key = _keyfile_read()
    if key:
        log.warning(
            "Using keyfile at %s instead of OS keyring. For better security, "
            "install/configure a keyring backend (e.g. gnome-keyring).",
            KEYFILE,
        )
        return key

    # 3. Generate a new key, prefer keyring, fall back to keyfile.
    new_key = Fernet.generate_key().decode()
    if _keyring_set(new_key):
        log.info("Stored new encryption key in OS keyring.")
        return new_key
    _keyfile_write(new_key)
    log.warning(
        "No OS keyring available. Generated encryption key at %s (chmod 600). "
        "This is less secure than a keyring backend.", KEYFILE,
    )
    return new_key


def get_fernet() -> Fernet:
    """Lazily build and cache the Fernet instance."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_load_or_create_key().encode())
    return _fernet


def using_keyring() -> bool:
    """True if the encryption key is being read from the OS keyring."""
    # Force resolution of the backend.
    get_fernet()
    return bool(_keyring_available)


# ---------------------------------------------------------------------------
# Encrypt / decrypt helpers
# ---------------------------------------------------------------------------
def encrypt_bytes(data: bytes) -> bytes:
    return get_fernet().encrypt(data)


def decrypt_bytes(token: bytes) -> bytes:
    try:
        return get_fernet().decrypt(token)
    except InvalidToken as exc:
        raise ValueError("Could not decrypt token — key may have changed.") from exc


def encrypt_json(obj: Any) -> bytes:
    return encrypt_bytes(json.dumps(obj).encode())


def decrypt_json(token: bytes | str) -> Any:
    if isinstance(token, str):
        token = token.encode()
    return json.loads(decrypt_bytes(token).decode())


# ---------------------------------------------------------------------------
# accounts.json read/write
# ---------------------------------------------------------------------------
def load_accounts_file() -> dict[str, dict]:
    """Return the decrypted account-token map keyed by email address.

    Shape: ``{ "<email>": {"token": <google creds dict>, "color": "#..."} }``
    Returns ``{}`` if the file does not yet exist (fresh install).
    """
    if not ACCOUNTS_FILE.exists():
        return {}
    try:
        raw = json.loads(ACCOUNTS_FILE.read_text())
    except json.JSONDecodeError:
        log.error("accounts.json is corrupt; ignoring.")
        return {}
    out: dict[str, dict] = {}
    for email, entry in raw.items():
        try:
            blob = entry.get("token")
            if isinstance(blob, str):
                out[email] = {
                    "token": decrypt_json(blob.encode()),
                    "color": entry.get("color", "#60a5fa"),
                }
        except ValueError as exc:
            log.error("Skipping account %s: %s", email, exc)
    return out


def save_accounts_file(accounts: dict[str, dict]) -> None:
    """Persist the in-memory account map, encrypting each token blob."""
    serializable: dict[str, dict] = {}
    for email, entry in accounts.items():
        serializable[email] = {
            "token": encrypt_json(entry["token"]).decode(),
            "color": entry.get("color", "#60a5fa"),
        }
    ACCOUNTS_FILE.write_text(json.dumps(serializable, indent=2))
    try:
        os.chmod(ACCOUNTS_FILE, 0o600)
    except OSError:  # pragma: no cover
        pass


if __name__ == "__main__":  # pragma: no cover - manual sanity check
    print("Using keyring:", using_keyring())
    print("Accounts file:", ACCOUNTS_FILE)
    test_blob = encrypt_json({"hello": "world"})
    print("Round-trip:", decrypt_json(test_blob))
