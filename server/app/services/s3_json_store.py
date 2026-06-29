"""Shared helpers for persisting a single JSON document to S3 or local disk.

The billing and call-schedule stores otherwise each duplicate the same boto3
bootstrap plus the S3/local read-write primitives. These functions centralize
that plumbing while leaving configuration (bucket, key, paths) and any
domain-specific normalization in the calling module — so callers keep their own
module-level globals and existing test monkeypatching keeps working.

Conventions:
  - Plain reads fail soft: a missing object/file or any read error returns the
    caller's ``default_factory()`` value.
  - ``update_json_document`` performs a concurrency-safe read-modify-write:
    locally via a file lock, on S3 via a conditional (ETag) write with retries
    so simultaneous writers can't silently clobber each other.
"""
import contextlib
import json
import logging
import os
import random
import time
from typing import Any, Callable, Optional, Tuple

from app.services.local_file_lock import local_file_lock

logger = logging.getLogger(__name__)

# Backoff bounds for the S3 conditional-write retry loop (seconds).
_RETRY_BASE_SECONDS = 0.05
_RETRY_MAX_SECONDS = 1.0


def init_s3_client(bucket: str, *, region: Optional[str] = None, label: str = "document"):
    """Create a boto3 S3 client when a bucket is configured, else return None."""
    if not bucket:
        return None
    try:
        import boto3  # type: ignore

        return boto3.client("s3", region_name=region) if region else boto3.client("s3")
    except Exception as e:
        logger.error("%s S3 client init failed bucket=%s: %s", label, bucket, e)
        return None


def s3_get_json(client, bucket: str, key: str, *, default_factory: Callable[[], Any], label: str) -> Any:
    """Read and parse a JSON object from S3; return the default on missing/error."""
    try:
        resp = client.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read().decode("utf-8"))
    except client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
        return default_factory()
    except Exception as e:
        logger.warning("S3 get %s failed key=%s: %s", label, key, e)
        return default_factory()


def local_read_json(path: str, *, default_factory: Callable[[], Any], label: str) -> Any:
    """Read and parse a JSON file; return the default on missing/error."""
    if not os.path.exists(path):
        return default_factory()
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("Read %s failed path=%s: %s", label, path, e)
        return default_factory()


def local_write_json(path: str, data: Any, *, sort_keys: bool = False) -> None:
    """Serialize and write a JSON file, creating parent dirs. Errors propagate."""
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=sort_keys)


@contextlib.contextmanager
def json_write_lock(*, use_s3: bool, local_path: str):
    """Hold an exclusive lock for a local read step that must see a stable file.

    Used by read-only callers; for read-modify-write use ``update_json_document``.
    The S3 path is a no-op (S3 reads are atomic).
    """
    if use_s3:
        yield
    else:
        with local_file_lock(local_path):
            yield


def update_json_document(
    *,
    use_s3: bool,
    client,
    bucket: str,
    key: str,
    local_path: str,
    default_factory: Callable[[], Any],
    label: str,
    mutate: Callable[[Any], Optional[Any]],
    sort_keys: bool = False,
    max_retries: int = 5,
) -> Any:
    """Atomically read-modify-write the backing JSON document.

    ``mutate`` receives the currently stored value (or ``default_factory()`` when
    the document is absent) and returns the new value to persist, or ``None`` to
    signal "no change" (nothing is written). Returns the value now stored: the
    mutate result when a write happened, otherwise the value that was read.

    Local backend: serialized by an exclusive file lock.
    S3 backend: a conditional write (``If-Match`` on the read ETag, or
    ``If-None-Match: *`` to create) retried with backoff. If another writer
    commits first, the precondition fails and we reload and re-apply ``mutate``,
    so concurrent edits can't be silently lost (the last-write-wins race).

    NOTE: ``mutate`` may run more than once on the S3 path (one run per attempt),
    so it must be free of irreversible side effects; do those after this returns.
    """
    if not use_s3:
        with local_file_lock(local_path):
            data = local_read_json(local_path, default_factory=default_factory, label=label)
            new_data = mutate(data)
            if new_data is None:
                return data
            local_write_json(local_path, new_data, sort_keys=sort_keys)
            return new_data

    last_error: Optional[Exception] = None
    for attempt in range(max_retries):
        data, etag = _s3_get_json_with_etag(
            client, bucket, key, default_factory=default_factory, label=label
        )
        new_data = mutate(data)
        if new_data is None:
            return data
        try:
            _s3_conditional_put_json(client, bucket, key, new_data, etag=etag, sort_keys=sort_keys)
            return new_data
        except Exception as e:  # inspect for a precondition failure; re-raise others
            if not _is_precondition_failure(e):
                raise
            last_error = e
            backoff = min(_RETRY_BASE_SECONDS * (2 ** attempt), _RETRY_MAX_SECONDS)
            time.sleep(backoff * random.random())

    raise RuntimeError(
        f"Conditional write for {label} (key={key}) failed after {max_retries} "
        "attempts due to concurrent updates."
    ) from last_error


def _s3_get_json_with_etag(
    client, bucket: str, key: str, *, default_factory: Callable[[], Any], label: str
) -> Tuple[Any, Optional[str]]:
    """Return (parsed_json, etag). Missing object -> (default, None).

    Unparseable JSON returns the default paired with the object's ETag so the
    caller can overwrite the corrupt object via a conditional write. Transient
    GET errors propagate so the caller doesn't write blindly over unknown state.
    """
    try:
        resp = client.get_object(Bucket=bucket, Key=key)
    except client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
        return default_factory(), None
    etag = resp.get("ETag")
    try:
        return json.loads(resp["Body"].read().decode("utf-8")), etag
    except Exception as e:
        logger.warning("S3 %s has unparseable JSON key=%s: %s", label, key, e)
        return default_factory(), etag


def _s3_conditional_put_json(
    client, bucket: str, key: str, data: Any, *, etag: Optional[str], sort_keys: bool
) -> None:
    """Write JSON to S3 only if the object is unchanged since it was read."""
    body = json.dumps(data, indent=2, sort_keys=sort_keys).encode("utf-8")
    condition = {"IfNoneMatch": "*"} if etag is None else {"IfMatch": etag}
    client.put_object(
        Bucket=bucket, Key=key, Body=body, ContentType="application/json", **condition
    )


def _is_precondition_failure(error: Exception) -> bool:
    """True if an S3 error means the conditional write lost a concurrency race."""
    response = getattr(error, "response", None) or {}
    code = response.get("Error", {}).get("Code")
    status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in ("PreconditionFailed", "ConditionalRequestConflict") or status in (409, 412)
