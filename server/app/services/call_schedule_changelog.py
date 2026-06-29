"""
Append-only change log for call schedule edits (single JSON file locally or S3).

Env:
  CALL_SCHEDULE_S3_BUCKET — if set, store log in S3
  CALL_SCHEDULE_CHANGELOG_S3_KEY — object key (default ``call_schedule_changelog.json``)
"""
import logging
import os
from typing import Any, Dict, List

from app.services.s3_json_store import (
    init_s3_client,
    json_write_lock,
    local_read_json,
    s3_get_json,
    update_json_document,
)

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
CALL_SCHEDULE_CHANGELOG_PATH = os.path.join(_DATA_DIR, "call_schedule_changelog.json")

CALL_SCHEDULE_S3_BUCKET = os.getenv("CALL_SCHEDULE_S3_BUCKET")
CALL_SCHEDULE_CHANGELOG_S3_KEY = (
    os.getenv("CALL_SCHEDULE_CHANGELOG_S3_KEY") or "call_schedule_changelog.json"
).strip()

MAX_CHANGELOG_ENTRIES = 5000

_s3_client = init_s3_client(CALL_SCHEDULE_S3_BUCKET or "", label="changelog")


def _uses_s3() -> bool:
    return bool(_s3_client and CALL_SCHEDULE_S3_BUCKET)


def load_changelog() -> List[Dict[str, Any]]:
    """Read the full change log.

    When S3 is configured it is the sole source of truth (a missing/empty object
    means "no history yet"); we never fall back to local disk.
    """
    if _uses_s3():
        raw = s3_get_json(
            _s3_client,
            CALL_SCHEDULE_S3_BUCKET,
            CALL_SCHEDULE_CHANGELOG_S3_KEY,
            default_factory=list,
            label="changelog",
        )
    else:
        raw = local_read_json(
            CALL_SCHEDULE_CHANGELOG_PATH, default_factory=list, label="changelog"
        )
    return _normalize_changelog(raw)


def _normalize_changelog(raw: Any) -> List[Dict[str, Any]]:
    """Coerce stored changelog data into a clean list of record dicts."""
    return [x for x in raw if isinstance(x, dict)] if isinstance(raw, list) else []


def append_changelog_entry(entry: Dict[str, Any]) -> None:
    """Append one change-log record; never raises (fail-soft).

    The write is atomic: the local path holds a file lock, and the S3 path uses a
    conditional (ETag) write with retries, so concurrent appends can't clobber
    one another.
    """

    def _append(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        entries.append(entry)
        return entries[-MAX_CHANGELOG_ENTRIES:] if len(entries) > MAX_CHANGELOG_ENTRIES else entries

    try:
        update_json_document(
            use_s3=_uses_s3(),
            client=_s3_client,
            bucket=CALL_SCHEDULE_S3_BUCKET,
            key=CALL_SCHEDULE_CHANGELOG_S3_KEY,
            local_path=CALL_SCHEDULE_CHANGELOG_PATH,
            default_factory=list,
            label="changelog",
            mutate=lambda raw: _append(_normalize_changelog(raw)),
        )
    except Exception as e:
        logger.warning("Failed to append call schedule changelog: %s", e)


def get_changelog_entries(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Newest-first slice for API consumers."""
    with json_write_lock(use_s3=_uses_s3(), local_path=CALL_SCHEDULE_CHANGELOG_PATH):
        entries = list(load_changelog())
    rev = list(reversed(entries))
    return rev[offset : offset + limit]
