"""Local LLM importance triage via the Ollama HTTP API.

Responsibilities
----------------
* ``test_connection(base_url)`` — hit ``GET /api/tags`` to verify Ollama is up
  and report which models are installed.
* ``scan_email(email, model, base_url)`` — build the structured prompt, call
  ``POST /api/generate``, and parse the JSON response into a ``TriageResult``.
* ``scan_batch(emails, ...)`` — process N emails, yielding progress.

Robustness
----------
* LLMs love to wrap JSON in ``` fences or add prose. We strip fences and fall
  back to a regex that extracts the first ``{...}`` object before giving up.
* If Ollama is unreachable we raise ``TriageUnavailable`` so callers can disable
  triage features gracefully (per spec) instead of 500-ing.
* Short timeouts on every call so a hung Ollama doesn't wedge the API.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass
from typing import Any, Iterator

import httpx

log = logging.getLogger("mailmind.triage")

DEFAULT_TIMEOUT = 60.0  # generation can be slow on CPU
CONNECT_TIMEOUT = 3.0   # quick failure if Ollama isn't running

# Known importance levels from the LLM. CRITICAL and HIGH are "important".
IMPORTANT_LEVELS = {"critical", "high"}


class TriageUnavailable(Exception):
    """Ollama not running / unreachable. Triage should be disabled."""


class TriageParseError(Exception):
    """Model returned something we couldn't coerce to JSON."""


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------
@dataclass
class TriageResult:
    important: bool
    score: int
    reason: str
    category: str
    summary: str = ""
    action_required: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ---------------------------------------------------------------------------
# Connection test
# ---------------------------------------------------------------------------
def test_connection(base_url: str, timeout: float = CONNECT_TIMEOUT) -> dict[str, Any]:
    """Return ``{"ok": bool, "models": [...], "error": str|None}``."""
    base = base_url.rstrip("/")
    try:
        resp = httpx.get(f"{base}/api/tags", timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        models = [m.get("name", "") for m in data.get("models", [])]
        return {"ok": True, "models": models, "error": None}
    except Exception as exc:
        return {"ok": False, "models": [], "error": str(exc)}


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------
PROMPT_TEMPLATE = """{rules}

------------------------
EMAIL TO ANALYZE
------------------------

Subject:
{subject}

From:
{sender}

To:
{to}

Body:
{body}"""


def _load_custom_rules() -> str:
    """Load the user's custom rules from ~/.mailmind/triage_rules.md.

    Imported lazily so a problem with the rules file never blocks module import.
    """
    try:
        from . import triage_rules
        rules = (triage_rules.load_rules() or "").strip()
        if rules:
            return rules
    except Exception as exc:  # pragma: no cover - best effort
        log.warning("Could not load custom triage rules: %s", exc)
    return ""


def _build_prompt(email: dict[str, Any]) -> str:
    body = (email.get("body_text") or "").strip()
    if len(body) > 1500:
        body = body[:1500]
    sender = (email.get("sender_name") or email.get("sender_email") or "Unknown").strip()
    subject = (email.get("subject") or "(no subject)").strip()
    to_addr = (email.get("recipient_email") or "me").strip()
    rules = _load_custom_rules()
    return PROMPT_TEMPLATE.format(sender=sender, subject=subject, body=body, to=to_addr, rules=rules)


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------
_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.DOTALL)
_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(raw: str) -> dict[str, Any]:
    """Coerce a model response into a dict, tolerating fences/prose."""
    text = raw.strip()

    # 1. Strip a single ```json ... ``` fence if the whole thing is fenced.
    m = _FENCE_RE.match(text)
    if m:
        text = m.group(1).strip()

    # 2. Direct parse.
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    # 3. Find the first {...} substring and retry.
    m = _OBJECT_RE.search(text)
    if m:
        candidate = m.group(0)
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            # Try progressively trimming trailing characters (common with
            # trailing commas / comments).
            for end in range(len(candidate), 0, -1):
                try:
                    parsed = json.loads(candidate[:end])
                    if isinstance(parsed, dict):
                        return parsed
                except json.JSONDecodeError:
                    continue

    raise TriageParseError(f"Could not extract JSON from: {raw[:200]!r}")


def _coerce_result(parsed: dict[str, Any]) -> TriageResult:
    """Validate + clamp the model's fields into a TriageResult.

    The model returns:
      importance: CRITICAL | HIGH | MEDIUM | LOW
      score: 0-100
      category: free-form string (e.g. "Job", "Security", "Finance")
      action_required: bool
      reason: string
      summary: string
    """
    # Score: 0-100 scale
    raw_score = parsed.get("score", 0)
    try:
        score = int(round(float(raw_score)))
    except (TypeError, ValueError):
        score = 0
    score = max(0, min(100, score))

    # Category: accept any string, title-case it
    raw_cat = str(parsed.get("category") or "").strip()
    category = raw_cat.title() if raw_cat else "Other"

    # Important: based on importance level label (compare case-insensitively).
    raw_importance = str(parsed.get("importance") or "").strip().lower()
    important = raw_importance in IMPORTANT_LEVELS

    # Action required: bool from model, default False
    raw_ar = parsed.get("action_required")
    if isinstance(raw_ar, bool):
        action_required = raw_ar
    elif isinstance(raw_ar, str):
        action_required = raw_ar.lower() in ("true", "1", "yes")
    else:
        action_required = False

    reason = str(parsed.get("reason") or "").strip() or "No reason provided."
    summary = str(parsed.get("summary") or "").strip()

    return TriageResult(
        important=important, score=score, reason=reason,
        category=category, summary=summary, action_required=action_required,
    )


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------
def _generate(model: str, base_url: str, prompt: str,
              timeout: float = DEFAULT_TIMEOUT) -> str:
    """Call Ollama /api/generate and return the raw model response text.

    Memory + output are capped via Ollama options to keep a long rescan from
    exhausting RAM: ``num_ctx`` bounds the context window, ``num_predict`` caps
    the generated tokens (reasoning models can otherwise emit very long
    ``<think>`` traces), and ``num_thread`` keeps CPU/memory bounded.
    """
    base = base_url.rstrip("/")
    try:
        resp = httpx.post(
            f"{base}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.2,
                    "num_ctx": 4096,       # cap context window (RAM)
                    "num_predict": 512,    # cap generated tokens (output length)
                    "num_thread": 4,       # bound concurrent CPU/memory use
                },
            },
            timeout=timeout,
        )
    except httpx.ConnectError as exc:
        raise TriageUnavailable(f"Ollama unreachable at {base}: {exc}") from exc
    except httpx.TimeoutException as exc:
        raise TriageUnavailable(f"Ollama timed out at {base}: {exc}") from exc

    if resp.status_code == 404:
        raise TriageUnavailable(
            f"Model '{model}' not found on Ollama. Pull it with `ollama pull {model}`."
        )
    resp.raise_for_status()
    data = resp.json()
    return data.get("response", "")


# ---------------------------------------------------------------------------
# Model warmup — preload the model into RAM so the first real scan is fast.
# ---------------------------------------------------------------------------
def warmup_model(model: str, base_url: str, timeout: float = 180.0) -> dict[str, Any]:
    """Send a trivial prompt to load ``model`` into Ollama's RAM.

    Returns ``{"ok": bool, "model": str, "error": str | None}``. The call can
    take a while the first time (model weights load from disk), hence the long
    timeout. Raises nothing — callers just read ``ok``.
    """
    base = base_url.rstrip("/")
    try:
        resp = httpx.post(
            f"{base}/api/generate",
            json={
                "model": model,
                "prompt": "ok",
                "stream": False,
                "keep_alive": "30m",
                "options": {"num_predict": 1, "temperature": 0},
            },
            timeout=timeout,
        )
        if resp.status_code == 404:
            return {
                "ok": False,
                "model": model,
                "error": f"Model '{model}' not found on Ollama.",
            }
        resp.raise_for_status()
        return {"ok": True, "model": model, "error": None}
    except httpx.ConnectError as exc:
        return {"ok": False, "model": model, "error": f"Ollama unreachable: {exc}"}
    except httpx.TimeoutException as exc:
        return {"ok": False, "model": model, "error": f"Ollama timed out: {exc}"}
    except Exception as exc:
        return {"ok": False, "model": model, "error": str(exc)}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def scan_email(email: dict[str, Any], *, model: str, base_url: str) -> TriageResult:
    """Triage a single email. Raises TriageUnavailable / TriageParseError."""
    prompt = _build_prompt(email)
    raw = _generate(model, base_url, prompt)
    parsed = _extract_json(raw)
    return _coerce_result(parsed)


def scan_batch(
    emails: list[dict[str, Any]],
    *,
    model: str,
    base_url: str,
) -> Iterator[tuple[int, TriageResult | None, str | None]]:
    """Triage a list of emails, yielding ``(email_id, result_or_None, error_or_None)``.

    Errors (parse / unavailable) don't abort the batch — they're reported per
    email so a single bad response doesn't waste the run. If Ollama is entirely
    unavailable we yield once with ``result=None`` and return.
    """
    for email in emails:
        eid = email.get("id")
        try:
            result = scan_email(email, model=model, base_url=base_url)
            yield eid, result, None
        except TriageUnavailable as exc:
            # Stop the whole batch — Ollama being down won't recover mid-run.
            yield eid, None, f"Ollama unavailable: {exc}"
            return
        except TriageParseError as exc:
            yield eid, None, f"Parse error: {exc}"
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("Unexpected triage error for email %s", eid)
            yield eid, None, f"Unexpected error: {exc}"
