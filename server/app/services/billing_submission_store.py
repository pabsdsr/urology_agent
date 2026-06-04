"""
Persist billing submissions (metadata index + sheet images).

Local dev (no ``BILLING_S3_BUCKET``): ``app/data/billing_submissions.json`` and ``app/data/billing_sheets/``.
Production: dedicated S3 bucket via ``BILLING_S3_BUCKET`` only (not the call-schedule bucket).
"""
import contextlib
import json
import logging
import mimetypes
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
LOCAL_INDEX_PATH = os.path.join(_DATA_DIR, "billing_submissions.json")
LOCAL_SHEETS_DIR = os.path.join(_DATA_DIR, "billing_sheets")

BILLING_S3_BUCKET = (os.getenv("BILLING_S3_BUCKET") or "").strip()
BILLING_SUBMISSIONS_INDEX_KEY = (
    os.getenv("BILLING_SUBMISSIONS_INDEX_KEY") or "billing_submissions.json"
).strip()
BILLING_SHEETS_S3_PREFIX = (os.getenv("BILLING_SHEETS_S3_PREFIX") or "billing_sheets/").strip()
if BILLING_SHEETS_S3_PREFIX and not BILLING_SHEETS_S3_PREFIX.endswith("/"):
    BILLING_SHEETS_S3_PREFIX += "/"

_billing_s3_region = (os.getenv("BILLING_S3_REGION") or "us-west-2").strip()

MAX_SUBMISSIONS = 5000

_s3_client = None
_s3_init_failed = False
if BILLING_S3_BUCKET:
    try:
        import boto3  # type: ignore

        _s3_client = boto3.client("s3", region_name=_billing_s3_region)
    except Exception as e:
        _s3_init_failed = True
        logger.error("Billing S3 client init failed bucket=%s: %s", BILLING_S3_BUCKET, e)


def billing_uses_s3() -> bool:
    return bool(BILLING_S3_BUCKET and _s3_client)


@contextlib.contextmanager
def _local_file_lock(path: str):
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


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_entry(entry: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure expected fields exist for API responses (older index rows may omit them)."""
    normalized = dict(entry)
    normalized["processed"] = bool(entry.get("processed"))
    return normalized


def _sheet_extension(content_type: str, filename: str) -> str:
    guessed = mimetypes.guess_extension(content_type or "") or ""
    if guessed == ".jpe":
        guessed = ".jpg"
    if guessed:
        return guessed
    name = (filename or "").lower()
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"):
        if name.endswith(ext):
            return ext if ext != ".jpeg" else ".jpg"
    return ".png"


def _local_sheet_path(submission_id: str, ext: str) -> str:
    return os.path.join(LOCAL_SHEETS_DIR, f"{submission_id}{ext}")


def _s3_sheet_key(submission_id: str, ext: str) -> str:
    return f"{BILLING_SHEETS_S3_PREFIX}{submission_id}{ext}"


def _load_index_unlocked() -> List[Dict[str, Any]]:
    if billing_uses_s3():
        try:
            resp = _s3_client.get_object(
                Bucket=BILLING_S3_BUCKET, Key=BILLING_SUBMISSIONS_INDEX_KEY
            )
            body = resp["Body"].read().decode("utf-8")
            data = json.loads(body)
            if isinstance(data, list):
                return [x for x in data if isinstance(x, dict)]
        except _s3_client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
            return []
        except Exception as e:
            logger.warning("S3 get billing index failed: %s", e)
            return []

    if not os.path.exists(LOCAL_INDEX_PATH):
        return []
    try:
        with open(LOCAL_INDEX_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except Exception as e:
        logger.warning("Read billing index failed: %s", e)
    return []


def _save_index_unlocked(entries: List[Dict[str, Any]]) -> None:
    if len(entries) > MAX_SUBMISSIONS:
        entries = entries[-MAX_SUBMISSIONS:]

    if billing_uses_s3():
        body = json.dumps(entries, indent=2).encode("utf-8")
        _s3_client.put_object(
            Bucket=BILLING_S3_BUCKET,
            Key=BILLING_SUBMISSIONS_INDEX_KEY,
            Body=body,
            ContentType="application/json",
        )
        return

    os.makedirs(os.path.dirname(LOCAL_INDEX_PATH), exist_ok=True)
    with open(LOCAL_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)


def _ensure_billing_s3_ready() -> None:
    if BILLING_S3_BUCKET and not billing_uses_s3():
        raise RuntimeError(
            f"BILLING_S3_BUCKET is set to {BILLING_S3_BUCKET!r} but the S3 client is unavailable. "
            "Check AWS credentials and BILLING_S3_REGION (default us-west-2)."
        )


def _save_sheet_bytes(
    submission_id: str,
    image_bytes: bytes,
    content_type: str,
    filename: str,
) -> str:
    ext = _sheet_extension(content_type, filename)
    if BILLING_S3_BUCKET:
        _ensure_billing_s3_ready()
    if billing_uses_s3():
        key = _s3_sheet_key(submission_id, ext)
        _s3_client.put_object(
            Bucket=BILLING_S3_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType=content_type or "application/octet-stream",
        )
        return key

    os.makedirs(LOCAL_SHEETS_DIR, exist_ok=True)
    path = _local_sheet_path(submission_id, ext)
    with open(path, "wb") as f:
        f.write(image_bytes)
    return path


def save_submission(
    *,
    patient_name: str,
    patient_dob: str,
    location: str,
    date_of_service: str,
    provider_name: str,
    cpt_code: str,
    icd10_code: str,
    submitted_by: str,
    submitter_email: Optional[str],
    practice_url: str,
    billing_sheet_filename: str,
    billing_sheet_content_type: str,
    billing_sheet_bytes: bytes,
) -> Dict[str, Any]:
    submission_id = str(uuid.uuid4())
    submitted_at = _utc_now_iso()
    storage_key = _save_sheet_bytes(
        submission_id,
        billing_sheet_bytes,
        billing_sheet_content_type,
        billing_sheet_filename,
    )
    entry = {
        "id": submission_id,
        "submitted_at": submitted_at,
        "patient_name": patient_name,
        "patient_dob": patient_dob,
        "location": location,
        "date_of_service": date_of_service,
        "provider_name": provider_name,
        "cpt_code": cpt_code,
        "icd10_code": icd10_code,
        "submitted_by": submitted_by,
        "submitter_email": submitter_email or "",
        "practice_url": practice_url,
        "billing_sheet_filename": billing_sheet_filename,
        "billing_sheet_content_type": billing_sheet_content_type,
        "billing_sheet_storage_key": storage_key,
        "processed": False,
    }

    if billing_uses_s3():
        entries = _load_index_unlocked()
        entries.append(entry)
        _save_index_unlocked(entries)
    else:
        with _local_file_lock(LOCAL_INDEX_PATH):
            entries = _load_index_unlocked()
            entries.append(entry)
            _save_index_unlocked(entries)

    logger.info("billing_submission_saved submission_id=%s", submission_id)
    return _normalize_entry(entry)


def list_submissions(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    if billing_uses_s3():
        entries = _load_index_unlocked()
    else:
        with _local_file_lock(LOCAL_INDEX_PATH):
            entries = list(_load_index_unlocked())
    rev = list(reversed(entries))
    return [_normalize_entry(e) for e in rev[offset : offset + limit]]


def _find_submission_in_index(
    entries: List[Dict[str, Any]], submission_id: str
) -> Optional[int]:
    for idx, entry in enumerate(entries):
        if entry.get("id") == submission_id:
            return idx
    return None


def get_submission(submission_id: str) -> Optional[Dict[str, Any]]:
    if billing_uses_s3():
        entries = _load_index_unlocked()
    else:
        with _local_file_lock(LOCAL_INDEX_PATH):
            entries = _load_index_unlocked()
    idx = _find_submission_in_index(entries, submission_id)
    if idx is None:
        return None
    return _normalize_entry(entries[idx])


def _update_index_entry(
    submission_id: str,
    updater: Callable[[Dict[str, Any]], None],
) -> Optional[Dict[str, Any]]:
    """Load index, mutate one entry in place, save, and return the normalized entry."""
    if billing_uses_s3():
        entries = _load_index_unlocked()
        idx = _find_submission_in_index(entries, submission_id)
        if idx is None:
            return None
        updater(entries[idx])
        _save_index_unlocked(entries)
        return _normalize_entry(entries[idx])

    with _local_file_lock(LOCAL_INDEX_PATH):
        entries = _load_index_unlocked()
        idx = _find_submission_in_index(entries, submission_id)
        if idx is None:
            return None
        updater(entries[idx])
        _save_index_unlocked(entries)
        return _normalize_entry(entries[idx])


def set_submission_processed(submission_id: str, *, processed: bool) -> Optional[Dict[str, Any]]:
    """Mark whether a billing submission has been processed by the billing team."""

    def _mark_processed(entry: Dict[str, Any]) -> None:
        entry["processed"] = processed

    entry = _update_index_entry(submission_id, _mark_processed)
    if entry:
        logger.info(
            "billing_submission_processed submission_id=%s processed=%s",
            submission_id,
            processed,
        )
    return entry


def _delete_sheet_file(entry: Dict[str, Any], submission_id: str) -> None:
    storage_key = entry.get("billing_sheet_storage_key") or ""

    if billing_uses_s3() and storage_key:
        try:
            _s3_client.delete_object(Bucket=BILLING_S3_BUCKET, Key=storage_key)
        except Exception as e:
            logger.warning(
                "S3 delete billing sheet failed id=%s key=%s: %s",
                submission_id,
                storage_key,
                e,
            )
        return

    if storage_key and os.path.isfile(storage_key):
        try:
            os.remove(storage_key)
        except OSError as e:
            logger.warning("Local delete billing sheet failed path=%s: %s", storage_key, e)

    for ext in (".png", ".jpg", ".webp", ".heic", ".heif", ".jpeg"):
        path = _local_sheet_path(submission_id, ext)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass


def _apply_submission_update(
    entry: Dict[str, Any],
    submission_id: str,
    *,
    patient_name: str,
    patient_dob: str,
    location: str,
    date_of_service: str,
    provider_name: str,
    cpt_code: str,
    icd10_code: str,
    billing_sheet_filename: Optional[str],
    billing_sheet_content_type: Optional[str],
    billing_sheet_bytes: Optional[bytes],
) -> None:
    entry["patient_name"] = patient_name
    entry["patient_dob"] = patient_dob
    entry["location"] = location
    entry["date_of_service"] = date_of_service
    entry["provider_name"] = provider_name
    entry["cpt_code"] = cpt_code
    entry["icd10_code"] = icd10_code
    entry["updated_at"] = _utc_now_iso()

    if billing_sheet_bytes:
        _delete_sheet_file(entry, submission_id)
        storage_key = _save_sheet_bytes(
            submission_id,
            billing_sheet_bytes,
            billing_sheet_content_type or "application/octet-stream",
            billing_sheet_filename or "billing-sheet.png",
        )
        entry["billing_sheet_filename"] = billing_sheet_filename or "billing-sheet.png"
        entry["billing_sheet_content_type"] = billing_sheet_content_type or "application/octet-stream"
        entry["billing_sheet_storage_key"] = storage_key


def update_submission(
    submission_id: str,
    *,
    patient_name: str,
    patient_dob: str,
    location: str,
    date_of_service: str,
    provider_name: str,
    cpt_code: str,
    icd10_code: str,
    billing_sheet_filename: Optional[str] = None,
    billing_sheet_content_type: Optional[str] = None,
    billing_sheet_bytes: Optional[bytes] = None,
) -> Optional[Dict[str, Any]]:
    """Update submission metadata and optionally replace the billing sheet image."""

    def _apply(entry: Dict[str, Any]) -> None:
        _apply_submission_update(
            entry,
            submission_id,
            patient_name=patient_name,
            patient_dob=patient_dob,
            location=location,
            date_of_service=date_of_service,
            provider_name=provider_name,
            cpt_code=cpt_code,
            icd10_code=icd10_code,
            billing_sheet_filename=billing_sheet_filename,
            billing_sheet_content_type=billing_sheet_content_type,
            billing_sheet_bytes=billing_sheet_bytes,
        )

    entry = _update_index_entry(submission_id, _apply)
    if entry:
        logger.info("billing_submission_updated submission_id=%s", submission_id)
    return entry


def delete_submission(submission_id: str) -> bool:
    """Remove submission from index and delete stored billing sheet. Returns False if not found."""
    if billing_uses_s3():
        entries = _load_index_unlocked()
        idx = _find_submission_in_index(entries, submission_id)
        if idx is None:
            return False
        entry = entries.pop(idx)
        _delete_sheet_file(entry, submission_id)
        _save_index_unlocked(entries)
    else:
        with _local_file_lock(LOCAL_INDEX_PATH):
            entries = _load_index_unlocked()
            idx = _find_submission_in_index(entries, submission_id)
            if idx is None:
                return False
            entry = entries.pop(idx)
            _delete_sheet_file(entry, submission_id)
            _save_index_unlocked(entries)

    logger.info("billing_submission_deleted submission_id=%s", submission_id)
    return True


def _is_local_filesystem_key(storage_key: str) -> bool:
    if not storage_key:
        return False
    if os.path.isabs(storage_key):
        return True
    return storage_key.startswith(("./", "../")) or "\\" in storage_key


def _try_load_sheet_from_s3(storage_key: str, submission_id: str) -> Optional[bytes]:
    if not billing_uses_s3():
        return None

    candidates: list[str] = []
    if storage_key and not _is_local_filesystem_key(storage_key):
        candidates.append(storage_key)
    for ext in (".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif"):
        candidates.append(_s3_sheet_key(submission_id, ext))

    seen: set[str] = set()
    for key in candidates:
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            resp = _s3_client.get_object(Bucket=BILLING_S3_BUCKET, Key=key)
            return resp["Body"].read()
        except _s3_client.exceptions.NoSuchKey:  # type: ignore[attr-defined]
            continue
        except Exception as e:
            logger.warning(
                "S3 get billing sheet failed id=%s key=%s: %s",
                submission_id,
                key,
                e,
            )
            return None
    return None


def load_billing_sheet(
    submission_id: str,
) -> Optional[Tuple[bytes, str, str]]:
    entry = get_submission(submission_id)
    if not entry:
        return None

    content_type = entry.get("billing_sheet_content_type") or "application/octet-stream"
    filename = entry.get("billing_sheet_filename") or "billing-sheet.png"
    storage_key = entry.get("billing_sheet_storage_key") or ""

    if storage_key and os.path.isfile(storage_key):
        with open(storage_key, "rb") as f:
            return f.read(), content_type, filename

    s3_bytes = _try_load_sheet_from_s3(storage_key, submission_id)
    if s3_bytes is not None:
        return s3_bytes, content_type, filename

    for ext in (".png", ".jpg", ".webp", ".heic", ".heif", ".jpeg"):
        path = _local_sheet_path(submission_id, ext)
        if os.path.isfile(path):
            with open(path, "rb") as f:
                return f.read(), content_type, filename

    logger.warning(
        "billing_sheet_not_found submission_id=%s storage_key=%s bucket=%s",
        submission_id,
        storage_key,
        BILLING_S3_BUCKET or "(local)",
    )
    return None
