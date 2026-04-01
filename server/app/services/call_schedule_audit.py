"""
Append-only audit log for call schedule changes (local JSON or S3, same bucket as schedule).
"""
import json
import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

CALL_SCHEDULE_AUDIT_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "call_schedule_audit.json",
)

CALL_SCHEDULE_S3_BUCKET = os.getenv("CALL_SCHEDULE_S3_BUCKET")
CALL_SCHEDULE_AUDIT_S3_KEY = os.getenv("CALL_SCHEDULE_AUDIT_S3_KEY", "call_schedule_audit.json")

MAX_AUDIT_ENTRIES = 5000

_s3_client = None
if CALL_SCHEDULE_S3_BUCKET:
    try:
        import boto3  # type: ignore

        _s3_client = boto3.client("s3")
    except Exception:
        _s3_client = None


def _ensure_dir() -> None:
    directory = os.path.dirname(CALL_SCHEDULE_AUDIT_PATH)
    os.makedirs(directory, exist_ok=True)


def _load_audit_from_s3() -> List[Dict[str, Any]]:
    if not (_s3_client and CALL_SCHEDULE_S3_BUCKET):
        return []
    try:
        resp = _s3_client.get_object(Bucket=CALL_SCHEDULE_S3_BUCKET, Key=CALL_SCHEDULE_AUDIT_S3_KEY)
        body = resp["Body"].read().decode("utf-8")
        data = json.loads(body)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []
    except _s3_client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
        return []
    except Exception:
        return []


def _save_audit_to_s3(entries: List[Dict[str, Any]]) -> None:
    if not (_s3_client and CALL_SCHEDULE_S3_BUCKET):
        return
    try:
        body = json.dumps(entries, indent=2).encode("utf-8")
        _s3_client.put_object(
            Bucket=CALL_SCHEDULE_S3_BUCKET,
            Key=CALL_SCHEDULE_AUDIT_S3_KEY,
            Body=body,
            ContentType="application/json",
        )
    except Exception:
        pass


def load_audit_log() -> List[Dict[str, Any]]:
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        s3_data = _load_audit_from_s3()
        if s3_data:
            return s3_data
    if not os.path.exists(CALL_SCHEDULE_AUDIT_PATH):
        return []
    try:
        with open(CALL_SCHEDULE_AUDIT_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
        return []
    except Exception:
        return []


def _save_audit_log(entries: List[Dict[str, Any]]) -> None:
    if _s3_client and CALL_SCHEDULE_S3_BUCKET:
        _save_audit_to_s3(entries)
    else:
        _ensure_dir()
        with open(CALL_SCHEDULE_AUDIT_PATH, "w", encoding="utf-8") as f:
            json.dump(entries, f, indent=2)


def append_audit_entry(entry: Dict[str, Any]) -> None:
    """Append one audit record; never raises (fail-soft)."""
    try:
        entries = load_audit_log()
        entries.append(entry)
        if len(entries) > MAX_AUDIT_ENTRIES:
            entries = entries[-MAX_AUDIT_ENTRIES:]
        _save_audit_log(entries)
    except Exception as e:
        logger.warning("Failed to append call schedule audit: %s", e)


def get_audit_entries(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Newest-first slice for API consumers."""
    entries = load_audit_log()
    rev = list(reversed(entries))
    return rev[offset : offset + limit]
