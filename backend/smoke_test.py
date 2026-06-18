"""Live end-to-end smoke test for the LLM triage pipeline.

Runs *against a real Ollama instance* (default http://localhost:11434) using
``gemma3:4b``. It triages three contrasting sample emails and prints the parsed
``TriageResult`` for each. Exit code is non-zero if any fail.

Run from the repo root:
    backend/.venv/bin/python -m backend.smoke_test
"""
from __future__ import annotations

import sys

from . import llm_triage

SAMPLES = [
    {
        "id": 1,
        "sender_name": "Sarah Chen",
        "sender_email": "sarah.chen@acmecorp.com",
        "subject": "Action needed: Q3 budget approval by Friday",
        "body_text": (
            "Hi, I need your approval on the Q3 budget by end of day Friday. "
            "The board meeting is Monday and we can't present without sign-off. "
            "Please review the attached deck and reply with approval or changes."
        ),
    },
    {
        "id": 2,
        "sender_name": "The Verge",
        "sender_email": "newsletter@theverge.com",
        "subject": "Today's tech news: AI, chips, and more",
        "body_text": (
            "Here's what you missed: a round-up of today's biggest stories in "
            "tech and science. Unsubscribe at the bottom of this email."
        ),
    },
    {
        "id": 3,
        "sender_name": "CONGRATULATIONS!!!",
        "sender_email": "winner@suspicious-domain.biz",
        "subject": "YOU'VE WON $1,000,000!!! Claim NOW",
        "body_text": (
            "Dear lucky winner, you have been selected to receive ONE MILLION "
            "DOLLARS!!! Click here and send your bank details to claim your "
            "prize within 24 hours!!!"
        ),
    },
]


def main() -> int:
    base = "http://localhost:11434"
    model = "hf.co/unsloth/Qwen3-4B-Instruct-2507-GGUF:UD-Q4_K_XL"

    print(f"Testing Ollama connection at {base}…")
    conn = llm_triage.test_connection(base)
    if not conn["ok"]:
        print(f"  FAIL: Ollama unreachable ({conn['error']})")
        return 1
    print(f"  ok — {len(conn['models'])} model(s): {conn['models']}")

    if model not in conn["models"]:
        print(f"  FAIL: model '{model}' not pulled. Run: ollama pull {model}")
        return 1

    print(f"\nTriaging {len(SAMPLES)} sample emails with {model}…")
    failures = 0
    for email in SAMPLES:
        print(f"\n  [{email['id']}] {email['subject']}")
        try:
            result = llm_triage.scan_email(email, model=model, base_url=base)
            print(f"      important={result.important} score={result.score} "
                  f"category={result.category}")
            print(f"      reason: {result.reason}")
        except llm_triage.TriageParseError as exc:
            failures += 1
            print(f"      PARSE ERROR: {exc}")
        except llm_triage.TriageUnavailable as exc:
            failures += 1
            print(f"      UNAVAILABLE: {exc}")

    print(f"\nDone — {len(SAMPLES) - failures}/{len(SAMPLES)} parsed cleanly.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
