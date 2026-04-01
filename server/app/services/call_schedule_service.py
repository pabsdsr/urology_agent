import copy
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

CALL_SCHEDULE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "call_schedule.json",
)

# Optional S3-backed storage for call schedule in production.
CALL_SCHEDULE_S3_BUCKET = os.getenv("CALL_SCHEDULE_S3_BUCKET")
CALL_SCHEDULE_S3_KEY = os.getenv("CALL_SCHEDULE_S3_KEY", "call_schedule.json")

_s3_client = None
if CALL_SCHEDULE_S3_BUCKET:
    try:
        import boto3  # type: ignore

        _s3_client = boto3.client("s3")
    except Exception:
        # If boto3 is not available, we silently fall back to local file storage.
        _s3_client = None


def _ensure_dir():
    directory = os.path.dirname(CALL_SCHEDULE_PATH)
    os.makedirs(directory, exist_ok=True)


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
    except Exception:
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
    except Exception:
        # Fail soft; better to have no update than crash the API.
        pass


def _load_call_schedule() -> Dict[str, Dict[str, str]]:
    """Load call schedule from storage. Keys are YYYY-MM-DD strings."""
    # Prefer S3 when configured, otherwise local JSON file.
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        data = _load_call_schedule_from_s3()
        if data:
            return data
    if not os.path.exists(CALL_SCHEDULE_PATH):
        return {}
    try:
        with open(CALL_SCHEDULE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): dict(v) for k, v in data.items()}
    except Exception:
        return {}


def _save_call_schedule(data: Dict[str, Dict[str, str]]) -> None:
    # Always try to save to S3 when configured.
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        _save_call_schedule_to_s3(data)
    else:
        _ensure_dir()
        with open(CALL_SCHEDULE_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)


def update_week(
    week_start: str,
    days: Dict[str, Dict[str, Any]],
    audit_meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Update (or create) call schedule entries for a single week.

    week_start: ISO date string (YYYY-MM-DD) for the start of the week (currently Sunday).
    days: mapping of date string -> { "North Pod": [...entries...], "Central Pod": [...], "South Pod": [...] }.
    audit_meta: if set, append an audit row with user + before/after for touched dates.
    """
    schedule = _load_call_schedule()
    norm_days: Dict[str, Dict[str, Any]] = {}
    for date_str, pods in days.items():
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d").date()
            norm_key = dt.strftime("%Y-%m-%d")
        except ValueError:
            continue
        norm_days[norm_key] = pods

    previous_by_date: Dict[str, Any] = {}
    if audit_meta and norm_days:
        for k in norm_days:
            prev = schedule.get(k)
            previous_by_date[k] = copy.deepcopy(prev) if prev is not None else None

    for norm_key, pods in norm_days.items():
        schedule[norm_key] = pods

    _save_call_schedule(schedule)

    if audit_meta and norm_days:
        from app.services.call_schedule_audit import append_audit_entry

        updated_by_date = {k: copy.deepcopy(schedule[k]) for k in norm_days}
        outlook_email = audit_meta.get("outlook_email")
        append_audit_entry(
            {
                "at": datetime.now(timezone.utc).isoformat(),
                "outlook_email": outlook_email,
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


def get_call_schedule_range(start_date: str, end_date: str) -> Dict[str, Dict[str, Any]]:
    """
    Return call schedule entries for an inclusive date range.
    Keys are YYYY-MM-DD strings between start_date and end_date.
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return {}

    raw = _load_call_schedule()
    result: Dict[str, Dict[str, str]] = {}
    cur = start_dt
    while cur <= end_dt:
        key = cur.strftime("%Y-%m-%d")
        if key in raw:
            result[key] = raw[key]
        cur += timedelta(days=1)
    return result


