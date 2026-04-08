"""
DynamoDB cache for surgery patient display names (PK practice_url, SK patient_id).

Env:
  PATIENT_CACHE_DYNAMODB_TABLE — default uroassist-patient-cache
  PATIENT_CACHE_DYNAMODB_REGION — optional AWS region
  PATIENT_CACHE_PK — partition key attribute (default practice_url)
  PATIENT_CACHE_SK — sort key attribute (default patient_id)
  PATIENT_CACHE_TTL_SECONDS — staleness for stale-while-revalidate (default 86400)
"""

from __future__ import annotations

import logging
import os
import time
from decimal import Decimal
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

PATIENT_CACHE_DYNAMODB_TABLE = (
    os.getenv("PATIENT_CACHE_DYNAMODB_TABLE") or "uroassist-patient-cache"
).strip()
PATIENT_CACHE_DYNAMODB_REGION = (
    os.getenv("PATIENT_CACHE_DYNAMODB_REGION") or ""
).strip()
PATIENT_CACHE_PK = (
    os.getenv("PATIENT_CACHE_PK") or "practice_url"
).strip() or "practice_url"
PATIENT_CACHE_SK = (
    os.getenv("PATIENT_CACHE_SK") or "patient_id"
).strip() or "patient_id"
PATIENT_CACHE_TTL_SECONDS = int(
    os.getenv("PATIENT_CACHE_TTL_SECONDS", "86400")
)

_dynamodb_client = None
_table_name: Optional[str] = None
_ddb_init_failed = False


def _get_client():
    """
    Returns (client, table_name) or (None, None) if DynamoDB is unavailable.
    Failures are cached for the process so we do not retry on every request.
    """
    global _dynamodb_client, _table_name, _ddb_init_failed
    if _ddb_init_failed:
        return None, None
    if _dynamodb_client is not None:
        return _dynamodb_client, _table_name
    try:
        import boto3  # type: ignore

        kwargs = {}
        if PATIENT_CACHE_DYNAMODB_REGION:
            kwargs["region_name"] = PATIENT_CACHE_DYNAMODB_REGION
        _dynamodb_client = boto3.client("dynamodb", **kwargs)
        _table_name = PATIENT_CACHE_DYNAMODB_TABLE
        return _dynamodb_client, _table_name
    except Exception as e:
        logger.warning(
            "Patient cache unavailable (UI will show patient id only): %s",
            e,
        )
        _ddb_init_failed = True
        return None, None


def patient_cache_writes_enabled() -> bool:
    """False when DynamoDB client could not be created (puts would no-op)."""
    c, t = _get_client()
    return bool(c and t)


def is_stale(cached_at: Any) -> bool:
    """Whether a cached row is older than configured staleness window."""
    if cached_at is None:
        return True
    try:
        if isinstance(cached_at, Decimal):
            ts = float(cached_at)
        else:
            ts = float(cached_at)
    except (TypeError, ValueError):
        return True
    return time.time() - ts >= PATIENT_CACHE_TTL_SECONDS


def _deserialize_item(item: Dict[str, Any]) -> Dict[str, Any]:
    """Convert DynamoDB wire-format attributes into plain python values."""
    from boto3.dynamodb.types import TypeDeserializer  # type: ignore

    deser = TypeDeserializer()
    return {k: deser.deserialize(v) for k, v in item.items()}


def batch_get_patient_names(
    practice_url: str, patient_ids: List[str]
) -> Dict[str, Dict[str, Any]]:
    """
    Returns map patient_id -> {given_name, family_name, display_name, cached_at}.
    Missing keys were not in DynamoDB.
    """
    if not patient_ids:
        return {}

    client, table = _get_client()
    if not client or not table:
        return {}

    # Dedupe while preserving stable order for chunking
    seen = set()
    unique: List[str] = []
    for pid in patient_ids:
        p = (pid or "").strip()
        if not p or p in seen:
            continue
        seen.add(p)
        unique.append(p)

    out: Dict[str, Dict[str, Any]] = {}
    pk_attr, sk_attr = PATIENT_CACHE_PK, PATIENT_CACHE_SK

    for i in range(0, len(unique), 100):
        chunk = unique[i : i + 100]
        pending_keys = [
            {
                pk_attr: {"S": practice_url},
                sk_attr: {"S": pid},
            }
            for pid in chunk
        ]
        attempt = 0
        while pending_keys and attempt < 3:
            try:
                resp = client.batch_get_item(
                    RequestItems={
                        table: {
                            "Keys": pending_keys,
                            "ConsistentRead": False,
                        }
                    }
                )
                for raw in resp.get("Responses", {}).get(table, []):
                    row = _deserialize_item(raw)
                    pid = str(row.get(sk_attr) or "").strip()
                    if not pid:
                        continue
                    cached_at = row.get("cached_at")
                    if isinstance(cached_at, Decimal):
                        cached_at = int(cached_at)
                    elif cached_at is not None:
                        try:
                            cached_at = int(float(cached_at))
                        except (TypeError, ValueError):
                            cached_at = None
                    out[pid] = {
                        "given_name": str(row.get("given_name") or "").strip(),
                        "family_name": str(row.get("family_name") or "").strip(),
                        "display_name": str(row.get("display_name") or "").strip(),
                        "cached_at": cached_at,
                    }
                unprocessed = resp.get("UnprocessedKeys") or {}
                pending_keys = unprocessed.get(table, {}).get("Keys", []) if unprocessed else []
                if pending_keys:
                    attempt += 1
                    sleep_s = 0.2 * (2 ** (attempt - 1))
                    logger.warning(
                        "Patient cache BatchGetItem unprocessed keys; retrying (%s keys, attempt %s)",
                        len(pending_keys),
                        attempt,
                    )
                    time.sleep(sleep_s)
            except Exception as e:
                logger.warning("Patient cache BatchGetItem failed (showing id only): %s", e)
                return out

    return out


def put_patient_name(
    practice_url: str,
    patient_id: str,
    given_name: str,
    family_name: str,
    display_name: str,
) -> None:
    """Upsert one patient name row for a practice in DynamoDB."""
    client, table = _get_client()
    if not client or not table:
        return
    pk_attr, sk_attr = PATIENT_CACHE_PK, PATIENT_CACHE_SK
    now = int(time.time())
    item = {
        pk_attr: {"S": practice_url},
        sk_attr: {"S": patient_id},
        "given_name": {"S": given_name or ""},
        "family_name": {"S": family_name or ""},
        "display_name": {"S": display_name or ""},
        "cached_at": {"N": str(now)},
    }
    try:
        client.put_item(TableName=table, Item=item)
    except Exception:
        logger.exception("Patient cache PutItem failed for %s", patient_id)
