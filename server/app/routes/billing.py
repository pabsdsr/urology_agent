import logging
import mimetypes
import re

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

from app.models import SessionUser
from app.routes.auth import get_current_user
from app.services.billing_codes_service import search_cpt_codes, search_cpt_modifiers, search_icd10_codes
from app.services.billing_cpt_lines import (
    derive_legacy_cpt_fields,
    parse_cpt_lines_json,
    validate_cpt_lines,
)
from app.services.billing_submission_store import (
    delete_submission,
    list_submissions,
    load_billing_sheet,
    save_submission,
    set_submission_processed,
    update_submission,
)

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)


class ProcessedUpdate(BaseModel):
    processed: bool

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}


def _split_billing_codes(raw: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,;]+", raw or "") if part.strip()]


def _validate_billing_sheet(content_type: str | None, size: int) -> None:
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Billing sheet must be a supported image file.")
    if size <= 0:
        raise HTTPException(status_code=400, detail="Billing sheet image is required.")
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="Billing sheet image exceeds the 10MB limit.")


async def _read_billing_sheet(upload: UploadFile) -> tuple[bytes, str, str]:
    image_bytes = await upload.read()
    await upload.close()
    _validate_billing_sheet(upload.content_type, len(image_bytes))
    return image_bytes, upload.content_type or "image/png", upload.filename or "billing-sheet.png"


def _inline_content_disposition(filename: str, submission_id: str, content_type: str) -> str:
    """Build a latin-1-safe Content-Disposition header (camera filenames may contain Unicode)."""
    ext = mimetypes.guess_extension(content_type or "") or ".png"
    if ext == ".jpe":
        ext = ".jpg"
    safe = re.sub(r"[^\w.\-]", "_", (filename or "").strip())
    safe = safe.strip("._")
    if not safe or not re.search(r"[A-Za-z0-9]", safe):
        safe = f"billing-sheet-{submission_id[:8]}{ext}"
    elif "." not in safe:
        safe = f"{safe}{ext}"
    return f'inline; filename="{safe}"'


def _parse_billing_form_fields(
    *,
    patient_name: str,
    patient_dob: str,
    location: str,
    date_of_service: str,
    provider_name: str,
    icd10_code: str,
    cpt_lines: str = "",
    cpt_code: str = "",
    cpt_modifiers: str = "",
) -> dict:
    patient_name = patient_name.strip()
    patient_dob = patient_dob.strip()
    location = location.strip()
    date_of_service = date_of_service.strip()
    provider_name = provider_name.strip()

    if not patient_name or not patient_dob:
        raise HTTPException(status_code=400, detail="Patient name and DOB are required.")
    if not location:
        raise HTTPException(status_code=400, detail="Location is required.")
    if not date_of_service:
        raise HTTPException(status_code=400, detail="Date of service is required.")
    if not provider_name:
        raise HTTPException(status_code=400, detail="Provider name is required.")

    parsed_lines = parse_cpt_lines_json(
        cpt_lines,
        cpt_code=cpt_code,
        cpt_modifiers=cpt_modifiers,
    )
    validated_lines = validate_cpt_lines(parsed_lines)
    legacy_cpt_code, legacy_cpt_modifiers = derive_legacy_cpt_fields(validated_lines)

    icd10_codes = [c.upper() for c in _split_billing_codes(icd10_code)]
    if not icd10_codes:
        raise HTTPException(status_code=400, detail="At least one ICD-10 code is required.")
    for code in icd10_codes:
        if not _validate_icd10_code(code):
            raise HTTPException(status_code=400, detail=f"Invalid ICD-10 code format: {code}")

    return {
        "patient_name": patient_name,
        "patient_dob": patient_dob,
        "location": location,
        "date_of_service": date_of_service,
        "provider_name": provider_name,
        "cpt_lines": validated_lines,
        "cpt_code": legacy_cpt_code,
        "icd10_code": ", ".join(icd10_codes),
        "cpt_modifiers": legacy_cpt_modifiers,
    }


def _validate_icd10_code(code: str) -> bool:
    normalized = code.strip().upper()
    if len(normalized) < 3:
        return False
    compact = normalized.replace(".", "")
    if not compact[0].isalpha():
        return False
    return compact[1:].isalnum()


@router.post("/submit")
async def submit_billing(
    patient_name: str = Form(...),
    patient_dob: str = Form(...),
    location: str = Form(...),
    date_of_service: str = Form(""),
    provider_name: str = Form(""),
    cpt_lines: str = Form(""),
    cpt_code: str = Form(""),
    icd10_code: str = Form(...),
    cpt_modifiers: str = Form(""),
    billing_sheet: UploadFile | None = File(default=None),
    current_user: SessionUser = Depends(get_current_user),
):
    fields = _parse_billing_form_fields(
        patient_name=patient_name,
        patient_dob=patient_dob,
        location=location,
        date_of_service=date_of_service,
        provider_name=provider_name,
        cpt_lines=cpt_lines,
        cpt_code=cpt_code,
        icd10_code=icd10_code,
        cpt_modifiers=cpt_modifiers,
    )

    sheet_filename: str | None = None
    sheet_content_type: str | None = None
    sheet_bytes: bytes | None = None
    if billing_sheet is not None and billing_sheet.filename:
        sheet_bytes, sheet_content_type, sheet_filename = await _read_billing_sheet(billing_sheet)

    try:
        entry = save_submission(
            **fields,
            submitted_by=current_user.username,
            submitter_email=current_user.email,
            practice_url=current_user.practice_url,
            billing_sheet_filename=sheet_filename,
            billing_sheet_content_type=sheet_content_type,
            billing_sheet_bytes=sheet_bytes,
        )
    except Exception as exc:
        logger.exception("billing_submission_save_failed")
        raise HTTPException(status_code=500, detail="Failed to save billing submission.") from exc

    submission_id = entry["id"]
    logger.info("billing_submission_saved submission_id=%s", submission_id)
    return {"status": "submitted", "submission_id": submission_id}


@router.get("/codes/cpt")
async def search_billing_cpt_codes(
    q: str = Query("", max_length=100),
    limit: int = Query(20, ge=1, le=50),
    current_user: SessionUser = Depends(get_current_user),
):
    """Search curated urology CPT codes (code or description)."""
    return {"codes": search_cpt_codes(q, limit)}


@router.get("/codes/icd10")
async def search_billing_icd10_codes(
    q: str = Query("", max_length=100),
    limit: int = Query(20, ge=1, le=50),
    current_user: SessionUser = Depends(get_current_user),
):
    """Search curated urology ICD-10 codes (code or description)."""
    return {"codes": search_icd10_codes(q, limit)}


@router.get("/codes/modifiers")
async def search_billing_cpt_modifiers(
    q: str = Query("", max_length=100),
    limit: int = Query(20, ge=1, le=50),
    current_user: SessionUser = Depends(get_current_user),
):
    """Search curated CPT modifiers (code or description)."""
    return {"codes": search_cpt_modifiers(q, limit)}


@router.get("/submissions")
async def get_billing_submissions(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: SessionUser = Depends(get_current_user),
):
    """Newest-first list of billing submissions for review."""
    entries = list_submissions(limit=limit, offset=offset)
    return {"submissions": entries, "limit": limit, "offset": offset}


@router.patch("/submissions/{submission_id}/processed")
async def set_billing_submission_processed(
    submission_id: str,
    body: ProcessedUpdate,
    current_user: SessionUser = Depends(get_current_user),
):
    """Mark a submission as processed (or unmark) for billing department tracking."""
    entry = set_submission_processed(submission_id, processed=body.processed)
    if not entry:
        raise HTTPException(status_code=404, detail="Billing submission not found.")
    logger.info(
        "billing_submission_processed submission_id=%s processed=%s by=%s",
        submission_id,
        body.processed,
        current_user.username,
    )
    return {"status": "updated", "submission": entry}


@router.get("/submissions/{submission_id}/sheet")
async def get_billing_submission_sheet(
    submission_id: str,
    current_user: SessionUser = Depends(get_current_user),
):
    loaded = load_billing_sheet(submission_id)
    if not loaded:
        raise HTTPException(status_code=404, detail="Billing sheet not found.")
    image_bytes, content_type, filename = loaded
    headers = {
        "Content-Disposition": _inline_content_disposition(
            filename, submission_id, content_type
        )
    }
    return Response(content=image_bytes, media_type=content_type, headers=headers)


@router.patch("/submissions/{submission_id}")
async def update_billing_submission(
    submission_id: str,
    patient_name: str = Form(...),
    patient_dob: str = Form(...),
    location: str = Form(...),
    date_of_service: str = Form(""),
    provider_name: str = Form(""),
    cpt_lines: str = Form(""),
    cpt_code: str = Form(""),
    icd10_code: str = Form(...),
    cpt_modifiers: str = Form(""),
    billing_sheet: UploadFile | None = File(default=None),
    current_user: SessionUser = Depends(get_current_user),
):
    fields = _parse_billing_form_fields(
        patient_name=patient_name,
        patient_dob=patient_dob,
        location=location,
        date_of_service=date_of_service,
        provider_name=provider_name,
        cpt_lines=cpt_lines,
        cpt_code=cpt_code,
        icd10_code=icd10_code,
        cpt_modifiers=cpt_modifiers,
    )

    sheet_filename: str | None = None
    sheet_content_type: str | None = None
    sheet_bytes: bytes | None = None

    if billing_sheet is not None and billing_sheet.filename:
        sheet_bytes, sheet_content_type, sheet_filename = await _read_billing_sheet(billing_sheet)

    try:
        entry = update_submission(
            submission_id,
            **fields,
            billing_sheet_filename=sheet_filename,
            billing_sheet_content_type=sheet_content_type,
            billing_sheet_bytes=sheet_bytes,
        )
    except Exception as exc:
        logger.exception("billing_submission_update_failed submission_id=%s", submission_id)
        raise HTTPException(status_code=500, detail="Failed to update billing submission.") from exc

    if not entry:
        raise HTTPException(status_code=404, detail="Billing submission not found.")

    logger.info("billing_submission_updated submission_id=%s by=%s", submission_id, current_user.username)
    return {"status": "updated", "submission": entry}


@router.delete("/submissions/{submission_id}")
async def delete_billing_submission(
    submission_id: str,
    current_user: SessionUser = Depends(get_current_user),
):
    if not delete_submission(submission_id):
        raise HTTPException(status_code=404, detail="Billing submission not found.")
    logger.info("billing_submission_deleted submission_id=%s by=%s", submission_id, current_user.username)
    return {"status": "deleted", "submission_id": submission_id}
