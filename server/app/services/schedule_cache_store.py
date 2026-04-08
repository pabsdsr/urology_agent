"""
Shared schedule cache: in-process dict or DynamoDB (gzip JSON payload).

Set SCHEDULE_CACHE_DYNAMODB_TABLE to enable DynamoDB (e.g. uroassist-schedule-cache).
Partition key: ``SCHEDULE_CACHE_DYNAMODB_PK`` (default ``practice_url``), holding the ModMed
firm segment / FHIR base path key; item payload is gzip JSON.

``DYNAMODB_REGION`` sets the AWS region for the DynamoDB client (default ``us-west-2``).

Optional composite key: set SCHEDULE_CACHE_DYNAMODB_SK to the sort key attribute name
and SCHEDULE_CACHE_DYNAMODB_SK_VALUE (default SCHEDULE_WINDOW).
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

SCHEDULE_CACHE_DYNAMODB_TABLE = (os.getenv("SCHEDULE_CACHE_DYNAMODB_TABLE") or "").strip()
_DDB_REGION = (os.getenv("DYNAMODB_REGION") or "").strip() or "us-west-2"
SCHEDULE_CACHE_DYNAMODB_PK = (os.getenv("SCHEDULE_CACHE_DYNAMODB_PK") or "practice_url").strip() or "practice_url"
SCHEDULE_CACHE_DYNAMODB_SK = (os.getenv("SCHEDULE_CACHE_DYNAMODB_SK") or "").strip()
SCHEDULE_CACHE_DYNAMODB_SK_VALUE = (
    (os.getenv("SCHEDULE_CACHE_DYNAMODB_SK_VALUE") or "SCHEDULE_WINDOW").strip() or "SCHEDULE_WINDOW"
)

# In-process fallback when DynamoDB is not configured (and unused when DDB is on).
_memory_cache: Dict[str, Dict[str, Any]] = {}

_dynamodb_table = None


def _get_table():
    global _dynamodb_table
    if not SCHEDULE_CACHE_DYNAMODB_TABLE:
        return None
    if _dynamodb_table is not None:
        return _dynamodb_table
    try:
        import boto3  # type: ignore

        resource = boto3.resource("dynamodb", region_name=_DDB_REGION)
        _dynamodb_table = resource.Table(SCHEDULE_CACHE_DYNAMODB_TABLE)
        return _dynamodb_table
    except Exception as e:
        logger.warning("Schedule cache DynamoDB init failed: %s", e)
        return None


def dynamodb_cache_enabled() -> bool:
    return bool(SCHEDULE_CACHE_DYNAMODB_TABLE) and _get_table() is not None


def _key(base_url: str) -> Dict[str, str]:
    k = {SCHEDULE_CACHE_DYNAMODB_PK: base_url}
    if SCHEDULE_CACHE_DYNAMODB_SK:
        k[SCHEDULE_CACHE_DYNAMODB_SK] = SCHEDULE_CACHE_DYNAMODB_SK_VALUE
    return k


def load_schedule_cache_entry(base_url: str) -> Optional[Dict[str, Any]]:
    """
    Returns cache entry dict: window_start, window_end, appointments, schedule, cached_at (epoch seconds).
    """
    table = _get_table()
    if table:
        try:
            resp = table.get_item(Key=_key(base_url))
            item = resp.get("Item")
            if not item:
                return None
            blob = item.get("payload")
            if blob is None:
                return None
            if hasattr(blob, "value"):
                blob = blob.value  # boto3 Binary
            if isinstance(blob, memoryview):
                blob = blob.tobytes()
            raw = gzip.decompress(bytes(blob)).decode("utf-8")
            data = json.loads(raw)
            cached_at = item.get("cached_at", 0)
            try:
                cached_at_n = int(cached_at)
            except (TypeError, ValueError):
                cached_at_n = int(float(cached_at))
            return {
                "window_start": str(item.get("window_start") or ""),
                "window_end": str(item.get("window_end") or ""),
                "appointments": data.get("appointments") or [],
                "schedule": data.get("schedule") or {},
                "cached_at": float(cached_at_n),
            }
        except Exception as e:
            logger.warning("Schedule cache DynamoDB read failed for %s: %s", base_url[:48], e)
            return None

    return _memory_cache.get(base_url)


def save_schedule_cache_entry(base_url: str, entry: Dict[str, Any]) -> None:
    """Persist full cache entry; cached_at must be epoch seconds (time.time())."""
    table = _get_table()
    if table:
        try:
            payload = gzip.compress(
                json.dumps(
                    {
                        "appointments": entry.get("appointments") or [],
                        "schedule": entry.get("schedule") or {},
                    },
                    separators=(",", ":"),
                    default=str,
                ).encode("utf-8")
            )
            if len(payload) > 390_000:
                logger.warning(
                    "Schedule cache payload %.1f KB exceeds safe DynamoDB item size; skipping write",
                    len(payload) / 1024,
                )
                return
            item = {
                **(_key(base_url)),
                "window_start": str(entry.get("window_start") or ""),
                "window_end": str(entry.get("window_end") or ""),
                "cached_at": int(entry.get("cached_at") or time.time()),
                "payload": payload,
            }
            table.put_item(Item=item)
        except Exception as e:
            logger.warning("Schedule cache DynamoDB write failed: %s", e)
        return

    _memory_cache[base_url] = entry
