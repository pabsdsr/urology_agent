"""
Single-tenant on-call schedule: one JSON file locally and/or one S3 object.
"""
import copy
import contextlib
import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

CALL_SCHEDULE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "call_schedule.json",
)

CALL_SCHEDULE_S3_BUCKET = os.getenv("CALL_SCHEDULE_S3_BUCKET")
CALL_SCHEDULE_S3_KEY = os.getenv("CALL_SCHEDULE_S3_KEY", "call_schedule.json")

_s3_client = None
if CALL_SCHEDULE_S3_BUCKET:
    try:
        import boto3  # type: ignore

        _s3_client = boto3.client("s3")
    except Exception:
        _s3_client = None


@contextlib.contextmanager
def _local_file_lock(path: str):
    """Exclusive lock around local schedule read/write (Unix). No-op on Windows."""
    if sys.platform == "win32":
        yield
        return
    import fcntl

    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    lock_path = path + ".lock"
    with open(lock_path, "a+", encoding="utf-8") as lf:
        fcntl.flock(lf.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lf.fileno(), fcntl.LOCK_UN)


def _load_call_schedule_from_s3() -> Dict[str, Dict[str, str]]:
    if not (_s3_client and CALL_SCHEDULE_S3_BUCKET):
        return {}
    try:
        resp = _s3_client.get_object(Bucket=CALL_SCHEDULE_S3_BUCKET, Key=CALL_SCHEDULE_S3_KEY)
        body = resp["Body"].read().decode("utf-8")
        data = json.loads(body)
        return {str(k): dict(v) for k, v in data.items()}
    except _s3_client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
        return {}
    except Exception as e:
        logger.warning("S3 get call schedule failed key=%s: %s", CALL_SCHEDULE_S3_KEY, e)
        return {}


def _save_call_schedule_to_s3(data: Dict[str, Dict[str, str]]) -> None:
    if not (_s3_client and CALL_SCHEDULE_S3_BUCKET):
        return
    try:
        body = json.dumps(data, indent=2, sort_keys=True).encode("utf-8")
        _s3_client.put_object(
            Bucket=CALL_SCHEDULE_S3_BUCKET,
            Key=CALL_SCHEDULE_S3_KEY,
            Body=body,
            ContentType="application/json",
        )
    except Exception as e:
        logger.error("S3 put call schedule failed key=%s: %s", CALL_SCHEDULE_S3_KEY, e)


def _load_call_schedule_disk() -> Dict[str, Dict[str, str]]:
    if not os.path.exists(CALL_SCHEDULE_PATH):
        return {}
    try:
        with open(CALL_SCHEDULE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): dict(v) for k, v in data.items()}
    except Exception as e:
        logger.warning("Read call schedule failed path=%s: %s", CALL_SCHEDULE_PATH, e)
        return {}


def _load_call_schedule() -> Dict[str, Dict[str, str]]:
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        s3_data = _load_call_schedule_from_s3()
        if s3_data:
            return s3_data
    return _load_call_schedule_disk()


def _save_call_schedule(data: Dict[str, Dict[str, str]]) -> None:
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        _save_call_schedule_to_s3(data)
    directory = os.path.dirname(CALL_SCHEDULE_PATH)
    os.makedirs(directory, exist_ok=True)
    try:
        with open(CALL_SCHEDULE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
    except Exception as e:
        logger.error("Write call schedule failed path=%s: %s", CALL_SCHEDULE_PATH, e)


def update_week(
    week_start: str,
    days: Dict[str, Dict[str, Any]],
    audit_meta: Optional[Dict[str, Any]] = None,
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

    def apply_merge(schedule: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        for norm_key, pods in norm_days.items():
            schedule[norm_key] = pods
        return schedule

    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        schedule = dict(_load_call_schedule())
        previous_by_date: Dict[str, Any] = {}
        if audit_meta and norm_days:
            for k in norm_days:
                prev = schedule.get(k)
                previous_by_date[k] = copy.deepcopy(prev) if prev is not None else None
        schedule = apply_merge(schedule)
        _save_call_schedule_to_s3(schedule)
    else:
        with _local_file_lock(CALL_SCHEDULE_PATH):
            schedule = dict(_load_call_schedule_disk())
            previous_by_date = {}
            if audit_meta and norm_days:
                for k in norm_days:
                    prev = schedule.get(k)
                    previous_by_date[k] = copy.deepcopy(prev) if prev is not None else None
            schedule = apply_merge(schedule)
            try:
                os.makedirs(os.path.dirname(CALL_SCHEDULE_PATH), exist_ok=True)
                with open(CALL_SCHEDULE_PATH, "w", encoding="utf-8") as f:
                    json.dump(schedule, f, indent=2, sort_keys=True)
            except Exception as e:
                logger.error("Write call schedule failed path=%s: %s", CALL_SCHEDULE_PATH, e)

    if audit_meta and norm_days:
        from app.services.call_schedule_audit import append_audit_entry

        updated_by_date = {k: copy.deepcopy(schedule[k]) for k in norm_days}
        email = audit_meta.get("email")
        append_audit_entry(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "email": email,
                "auth_method": audit_meta.get("auth_method") or "",
                "practice_url": audit_meta.get("practice_url") or "",
                "is_admin": bool(audit_meta.get("is_admin")),
                "source": audit_meta.get("source") or "unknown",
                "upload_filename": audit_meta.get("upload_filename"),
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

    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        raw = _load_call_schedule()
    else:
        with _local_file_lock(CALL_SCHEDULE_PATH):
            raw = _load_call_schedule_disk()

    result: Dict[str, Dict[str, Any]] = {}
    cur = start_dt
    while cur <= end_dt:
        key = cur.strftime("%Y-%m-%d")
        if key in raw:
            result[key] = raw[key]
        cur += timedelta(days=1)
    return result
