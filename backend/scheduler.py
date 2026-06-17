"""Background email sync via APScheduler.

A single ``IntervalTrigger`` job periodically syncs all non-paused accounts and,
if ``auto_scan`` is enabled, triages any unscored emails afterwards. The job is
reschedulable at runtime when the user changes the sync interval in Settings.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .database import Account, SessionLocal, get_all_settings, get_setting, set_setting

log = logging.getLogger("mailmind.scheduler")

SYNC_JOB_ID = "mailmind-sync"
_STATUS: dict = {"running": False, "last_run": None, "last_result": None}


def _set_status(**kw) -> None:
    _STATUS.update(kw)


def get_status() -> dict:
    return dict(_STATUS)


# ---------------------------------------------------------------------------
# The actual periodic work
# ---------------------------------------------------------------------------
def run_sync_job() -> None:
    """Sync all non-paused accounts, optionally auto-triaging afterwards."""
    if _STATUS.get("running"):
        log.info("Skipping scheduled sync — another run is in progress.")
        return
    _set_status(running=True, last_run=datetime.now(timezone.utc).isoformat())

    # Import here so module import is cheap and circular deps are avoided.
    from . import gmail_sync
    from .triage_runner import run_triage_scan

    results = []
    try:
        with SessionLocal() as db:
            accounts = db.query(Account).filter_by(paused=False).all()
            settings = get_all_settings(db)
            # Detach plain values we need outside the session.
            account_ids = [a.id for a in accounts]

        for aid in account_ids:
            with SessionLocal() as db:
                account = db.get(Account, aid)
                if account is None:
                    continue
                results.append(gmail_sync.sync_account(account))

        # Auto-triage new (unscored) emails if the user enabled it.
        with SessionLocal() as db:
            auto_scan = get_setting(db, "auto_scan")
        if auto_scan:
            try:
                triage_summary = run_triage_scan(rescan=False, limit=50)
                results.append({"triage": triage_summary})
            except Exception as exc:  # pragma: no cover - triage is best-effort
                log.warning("auto-triage failed: %s", exc)

        _set_status(running=False, last_result=results)
    except Exception as exc:  # pragma: no cover
        log.exception("Scheduled sync failed")
        _set_status(running=False, last_result={"error": str(exc)})


# ---------------------------------------------------------------------------
# Scheduler lifecycle
# ---------------------------------------------------------------------------
_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.start()
    reschedule()
    log.info("Scheduler started.")


def reschedule(interval_minutes: int | None = None) -> None:
    """Recreate the interval job with the current (or given) interval."""
    if _scheduler is None:
        return
    with SessionLocal() as db:
        interval = interval_minutes or int(get_setting(db, "sync_interval_minutes"))

    if _scheduler.get_job(SYNC_JOB_ID) is not None:
        _scheduler.remove_job(SYNC_JOB_ID)
    trigger = IntervalTrigger(minutes=interval)
    _scheduler.add_job(run_sync_job, trigger=trigger, id=SYNC_JOB_ID,
                       replace_existing=True, coalesce=True, max_instances=1)
    log.info("Scheduled sync every %d minute(s).", interval)


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
