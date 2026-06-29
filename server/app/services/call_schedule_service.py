"""Single-tenant on-call schedule: one JSON file locally and/or one S3 object."""
import copy
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from app.services.s3_json_store import (
    init_s3_client,
    json_write_lock,
    local_read_json,
    s3_get_json,
    update_json_document,
)

logger = logging.getLogger(__name__)

CALL_SCHEDULE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "call_schedule.json",
)

CALL_SCHEDULE_S3_BUCKET = os.getenv("CALL_SCHEDULE_S3_BUCKET")
CALL_SCHEDULE_S3_KEY = os.getenv("CALL_SCHEDULE_S3_KEY", "call_schedule.json")

_s3_client = init_s3_client(CALL_SCHEDULE_S3_BUCKET or "", label="call schedule")


def _uses_s3() -> bool:
    return bool(_s3_client and CALL_SCHEDULE_S3_BUCKET)


def _normalize_schedule(raw: Any) -> Dict[str, Dict[str, str]]:
    """Coerce stored schedule data into a clean {date: {pod: ...}} mapping."""
    if not isinstance(raw, dict):
        return {}
    return {str(k): dict(v) for k, v in raw.items() if isinstance(v, dict)}


def _load_call_schedule() -> Dict[str, Dict[str, str]]:
    """Read the canonical schedule.

    When S3 is configured it is the sole source of truth: a missing or empty
    object means "no schedule yet", and we never fall back to local disk (doing
    so would let stale local state shadow/merge into S3 across instances).
    """
    if _uses_s3():
        raw = s3_get_json(
            _s3_client,
            CALL_SCHEDULE_S3_BUCKET,
            CALL_SCHEDULE_S3_KEY,
            default_factory=dict,
            label="call schedule",
        )
    else:
        raw = local_read_json(CALL_SCHEDULE_PATH, default_factory=dict, label="call schedule")
    return _normalize_schedule(raw)


def update_week(
    week_start: str,
    days: Dict[str, Dict[str, Any]],
    changelog_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Update (or create) call schedule entries for a single week.

    week_start: ISO date (YYYY-MM-DD) for the week start (Sunday).
    days: mapping of date string -> { "North Pod": [...], ... }.
    """
    norm_days: Dict[str, Dict[str, Any]] = {}
    for date_str, pods in days.items():
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d").date()
            norm_key = dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
        norm_days[norm_key] = pods

    # The read-modify-write is atomic: the local path holds a file lock, and the
    # S3 path uses a conditional (ETag) write with retries, so concurrent week
    # edits can't silently clobber one another. `mutate` may re-run on an S3
    # retry, so it only recomputes in-memory state (no irreversible side effects).
    previous_by_date: Dict[str, Any] = {}

    def _merge_week(schedule: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        previous_by_date.clear()
        if changelog_meta and norm_days:
            for k in norm_days:
                prev = schedule.get(k)
                previous_by_date[k] = copy.deepcopy(prev) if prev is not None else None
        for norm_key, pods in norm_days.items():
            schedule[norm_key] = pods
        return schedule

    schedule = update_json_document(
        use_s3=_uses_s3(),
        client=_s3_client,
        bucket=CALL_SCHEDULE_S3_BUCKET,
        key=CALL_SCHEDULE_S3_KEY,
        local_path=CALL_SCHEDULE_PATH,
        default_factory=dict,
        label="call schedule",
        mutate=lambda raw: _merge_week(_normalize_schedule(raw)),
        sort_keys=True,
    )

    if changelog_meta and norm_days:
        from app.services.call_schedule_changelog import append_changelog_entry

        updated_by_date = {k: copy.deepcopy(schedule[k]) for k in norm_days}
        email = changelog_meta.get("email")
        append_changelog_entry(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "email": email,
                "auth_method": changelog_meta.get("auth_method") or "",
                "practice_url": changelog_meta.get("practice_url") or "",
                "is_admin": bool(changelog_meta.get("is_admin")),
                "source": changelog_meta.get("source") or "unknown",
                "upload_filename": changelog_meta.get("upload_filename"),
                "week_start": week_start,
                "affected_dates": sorted(norm_days.keys()),
                "previous_by_date": previous_by_date,
                "updated_by_date": updated_by_date,
            }
        )

    return schedule


def get_call_schedule_range(
    start_date: str, end_date: str
) -> Dict[str, Dict[str, Any]]:
    """Return call schedule entries for an inclusive date range (YYYY-MM-DD keys)."""
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return {}

    with json_write_lock(use_s3=_uses_s3(), local_path=CALL_SCHEDULE_PATH):
        raw = _load_call_schedule()

    result: Dict[str, Dict[str, Any]] = {}
    cur = start_dt
    while cur <= end_dt:
        key = cur.strftime("%Y-%m-%d")
        if key in raw:
            result[key] = raw[key]
        cur += timedelta(days=1)
    return result
