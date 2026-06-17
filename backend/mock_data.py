"""Seed data so the UI is fully explorable with zero setup.

When ``mock_mode`` is enabled and there are no real accounts, ``seed_mock()``
plants a synthetic "Demo Account" plus ~30 realistic emails across several
triage categories (action_required, deadline, financial, newsletter, spam...).
About a third come pre-scored so the Important tab is immediately populated.

The data is deliberately diverse: invoices, deadline-driven requests, personal
notes, newsletters, and obvious spam — enough variety to exercise every UI
state (read/unread, starred, important, categories, scores).
"""
from __future__ import annotations

import datetime as _dt
import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from .database import Account, Email

log = logging.getLogger("mailmind.mock")

MOCK_ACCOUNT_EMAIL = "demo@example.com"
MOCK_ACCOUNT_COLOR = "#60a5fa"

# (sender_name, sender_email, subject, body_html, category, score, important,
#  days_ago, is_read, is_starred)
_SEED: list[tuple[str, str, str, str, str | None, int | None, bool | None, int, bool, bool]] = [
    (
        "Sarah Chen", "sarah.chen@acmecorp.com",
        "Action needed: Q3 budget approval by Friday",
        "<p>Hi,</p><p>I need your <b>approval on the Q3 budget</b> by end of day "
        "Friday. The board meeting is Monday and we can't present without sign-off. "
        "Please review the attached deck and reply with approval or changes.</p>"
        "<p>Thanks,<br>Sarah</p>",
        "action_required", 9, True, 1, False, True,
    ),
    (
        "GitHub", "noreply@github.com",
        "[mailmind] Security alert: new sign-in",
        "<p>We noticed a new sign-in to your account from <b>Linux / Chrome</b> "
        "in <b>Berlin, DE</b>. If this was you, you can ignore this email.</p>",
        "action_required", 7, True, 1, True, False,
    ),
    (
        "Stripe", "receipts@stripe.com",
        "Your invoice #INV-2026-0042 for $1,240.00",
        "<p>Thanks for your business. Invoice <b>#INV-2026-0042</b> for "
        "<b>$1,240.00</b> is now available. Payment will be charged to the card "
        "on file.</p>",
        "financial", 8, True, 2, False, False,
    ),
    (
        "IRS", "no-reply@irs.gov",
        "Reminder: Estimated tax payment due June 15",
        "<p>This is a reminder that your Q2 estimated tax payment is due "
        "<b>June 15, 2026</b>. Late payments may incur penalties.</p>",
        "deadline", 9, True, 3, False, False,
    ),
    (
        "Mom", "pat@example.com",
        "Sunday dinner this weekend?",
        "<p>Hi sweetheart — are you free for dinner Sunday? Dad's making his "
        "famous lasagna. Let me know! ❤️</p>",
        "personal", 7, True, 4, True, False,
    ),
    (
        "AWS Billing", "no-reply@aws.amazon.com",
        "Your AWS bill for May 2026: $428.17",
        "<p>Your AWS bill for the billing period ending May 31, 2026 is "
        "<b>$428.17</b>. View the detailed breakdown in the Billing Console.</p>",
        "financial", 7, True, 5, True, False,
    ),
    (
        "Greenhouse", "notifications@greenhouse.io",
        "Interview feedback requested: Priya N. (Senior Eng)",
        "<p>Your feedback is due for <b>Priya N.</b>'s interview for Senior "
        "Engineer. Please submit within 48 hours to keep the candidate moving.</p>",
        "deadline", 8, True, 6, False, False,
    ),
    (
        "Linear", "noreply@linear.app",
        "5 issues assigned to you this week",
        "<p>You have 5 issues assigned this week, 2 of which are marked "
        "<b>Urgent</b>. Review them in Linear.</p>",
        "action_required", 6, True, 6, False, False,
    ),
    (
        "Figma", "team@figma.com",
        "Alex commented on 'MailMind v2 — Mobile'",
        "<p><b>Alex Rivera</b> commented: \"Can we align the sidebar width "
        "with the desktop version? Feels cramped on tablet.\"</p>",
        "personal", 5, True, 7, True, False,
    ),
    (
        "Notion", "team@makenotion.com",
        "Weekly digest: 12 updates in your workspace",
        "<p>12 pages were updated in your workspace this week.</p>",
        "newsletter", 2, False, 7, True, False,
    ),
    (
        "The Verge", "newsletter@theverge.com",
        "Today's tech news: AI, chips, and more",
        "<p>Here's what you missed: a round-up of today's biggest stories in "
        "tech and science.</p>",
        "newsletter", 2, False, 8, True, False,
    ),
    (
        "Hacker News Weekly", "hn@hnmail.com",
        "Top stories of the week",
        "<p>This week on HN: a new Rust web framework, a deep-dive on SQLite "
        "internals, and why your cron jobs are lying to you.</p>",
        "newsletter", 3, False, 8, True, False,
    ),
    (
        "CONGRATULATIONS!!!", "winner@suspicious-domain.biz",
        "YOU'VE WON $1,000,000!!! Claim NOW",
        "<p>Dear lucky winner, you have been selected to receive ONE MILLION "
        "DOLLARS!!! Click here and send your bank details to claim your prize "
        "within 24 hours!!!</p>",
        "spam", 1, False, 9, False, False,
    ),
    (
        "Crypto Insider", "info@crypto-insider.xyz",
        "🚀 1000x GAINS — Don't miss this coin!!!",
        "<p>This tiny crypto is about to MOON. Get in before the big exchange "
        "listing! Act fast!!!</p>",
        "spam", 1, False, 9, False, False,
    ),
    (
        "Netflix", "info@netflix.com",
        "New on Netflix: June 2026",
        "<p>Check out what's new on Netflix this month — blockbusters, "
        "originals, and hidden gems.</p>",
        "newsletter", 2, False, 10, True, False,
    ),
    (
        "Dr. Patel's Office", "reminders@drpatel.com",
        "Appointment confirmation: June 20, 2:00 PM",
        "<p>This is a confirmation of your appointment with Dr. Patel on "
        "<b>June 20 at 2:00 PM</b>. Please arrive 10 minutes early.</p>",
        "deadline", 8, True, 10, False, True,
    ),
    (
        "Slack", "feedback@slack.com",
        "Your workspace summary: 34 unread mentions",
        "<p>You have 34 unread mentions across 8 channels. Catch up in Slack.</p>",
        "newsletter", 4, False, 11, True, False,
    ),
    (
        " recruiter@techco.com", "recruiter@techco.com",
        "Following up — Senior Platform Engineer role",
        "<p>Hi, following up on the Senior Platform Engineer role we discussed. "
        "Are you still interested? The team would love to move forward.</p>",
        "personal", 6, True, 12, False, False,
    ),
    (
        "Apple", "no_reply@email.apple.com",
        "Your receipt from Apple",
        "<p>Your order has been processed. Total: <b>$129.00</b>.</p>",
        "financial", 5, True, 12, True, False,
    ),
    (
        "Zoom", "no-reply@zoom.us",
        "Recording available: 'Engineering All-Hands'",
        "<p>The recording for 'Engineering All-Hands' is now available.</p>",
        "personal", 3, False, 13, True, False,
    ),
    (
        "Bank of Example", "alerts@boe.com",
        "Suspicious login attempt blocked",
        "<p>We blocked a sign-in attempt to your account from an unrecognized "
        "device. If this wasn't you, your account is safe.</p>",
        "action_required", 8, True, 14, False, False,
    ),
    (
        "Medium Daily", "noreply@medium.com",
        "Stories you might like",
        "<p>7 stories picked for you based on your reading history.</p>",
        "newsletter", 2, False, 14, True, False,
    ),
    (
        "Calendly", "notifications@calendly.com",
        "New event scheduled: 1:1 with Marcus",
        "<p>Marcus L. scheduled a 30-minute 1:1 with you for tomorrow at 3 PM.</p>",
        "deadline", 5, True, 15, False, False,
    ),
    (
        "Mailchimp", "campaigns@mailchimp.com",
        "Your campaign was sent to 12,402 subscribers",
        "<p>Your campaign 'June Newsletter' was successfully sent.</p>",
        "newsletter", 2, False, 16, True, False,
    ),
    (
        "Free iPhone!!!", "promo@scam-promo.net",
        "You're our 1,000,000th visitor! Claim your free iPhone",
        "<p>Congratulations! You're our millionth visitor! Click to claim your "
        "FREE iPhone 15 Pro Max — just pay shipping!!!</p>",
        "spam", 1, False, 16, False, False,
    ),
    (
        "Vercel", "support@vercel.com",
        "Deployment failed for project 'mailmind-web'",
        "<p>Your deployment for <b>mailmind-web</b> failed during the build "
        "step. Check the logs to diagnose.</p>",
        "action_required", 7, True, 17, False, False,
    ),
    (
        "GitHub Actions", "actions@github.com",
        "✓ CI passed on main",
        "<p>All checks passed on commit <code>abc1234</code> pushed to main.</p>",
        "personal", 3, False, 18, True, False,
    ),
    (
        "Dropbox", "no-reply@dropbox.com",
        "Sam shared 'Q4 Planning' with you",
        "<p>Sam shared a folder with you: 'Q4 Planning'.</p>",
        "personal", 4, False, 19, True, False,
    ),
    (
        "PayPal", "service@paypal.com",
        "You've received $250.00",
        "<p>You've received <b>$250.00</b> from Jamie K. The funds are now "
        "available in your PayPal balance.</p>",
        "financial", 6, True, 20, True, False,
    ),
    (
        "LinkedIn", "messages-noreply@linkedin.com",
        "You have 5 new connection requests",
        "<p>5 people want to connect with you on LinkedIn.</p>",
        "newsletter", 2, False, 21, True, False,
    ),
]


def _snippet(html: str) -> str:
    import re
    txt = re.sub(r"(?s)<[^>]+>", " ", html)
    return " ".join(txt.split())[:200]


def _body_text(html: str) -> str:
    import re
    txt = re.sub(r"(?s)<[^>]+>", " ", html)
    return " ".join(txt.split())


def get_or_create_mock_account(db: Session) -> Account:
    account = db.query(Account).filter_by(email=MOCK_ACCOUNT_EMAIL).first()
    if account is None:
        account = Account(email=MOCK_ACCOUNT_EMAIL, color=MOCK_ACCOUNT_COLOR,
                          history_id=None, paused=False, needs_reauth=False)
        db.add(account)
        db.commit()
        db.refresh(account)
    return account


def seed_mock(force: bool = False) -> int:
    """Seed demo emails if none exist yet (or if ``force``). Returns count."""
    from .database import SessionLocal

    now = _dt.datetime.now(_dt.timezone.utc)
    count = 0
    with SessionLocal() as db:
        existing = db.query(Email).join(Account, Email.account_id == Account.id) \
            .filter(Account.email == MOCK_ACCOUNT_EMAIL).count()
        if existing and not force:
            return 0

        account = get_or_create_mock_account(db)

        for (name, sender, subject, html, category, score, important,
             days_ago, is_read, is_starred) in _SEED:
            date = now - _dt.timedelta(days=days_ago, hours=count % 5)
            scanned = None
            model = None
            if category is not None and score is not None:
                scanned = date  # pretend it was triaged when received
                model = "mock-seed"
            email = Email(
                account_id=account.id,
                gmail_message_id=f"mock-{days_ago}-{count:03d}",
                thread_id=f"mock-thread-{days_ago}",
                sender_name=name.strip(),
                sender_email=sender.strip(),
                subject=subject,
                snippet=_snippet(html),
                body_html=html,
                body_text=_body_text(html),
                date=date,
                is_read=is_read,
                is_starred=is_starred,
                labels=json.dumps([]),
                important=bool(important) if important is not None else False,
                importance_score=score,
                importance_reason=_canned_reason(category) if category else None,
                category=category,
                scanned_at=scanned,
                scan_model=model,
                synced_at=date,
            )
            db.add(email)
            count += 1
        db.commit()
    log.info("Seeded %d mock emails.", count)
    return count


def _canned_reason(category: str | None) -> str:
    return {
        "action_required": "Explicit action requested with a clear owner.",
        "deadline": "Time-sensitive; a deadline is stated.",
        "financial": "Involves money, billing, or a transaction.",
        "personal": "Direct, personal communication.",
        "newsletter": "Bulk/automated digest — low urgency.",
        "spam": "Classic spam signals: caps, urgency, too-good-to-be-true.",
        "other": "Could not be confidently categorized.",
    }.get(category or "", "")
