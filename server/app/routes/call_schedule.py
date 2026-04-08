from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel, Field
import asyncio
from typing import Any, Dict, List, Optional

from app.models import SessionUser
from app.routes.auth import get_current_user, require_admin, require_modmed_session
from app.services.call_schedule_service import update_week, get_call_schedule_range
from app.services.call_schedule_import import parse_call_schedule_upload
from app.services.call_schedule_audit import get_audit_entries


router = APIRouter(
    prefix="/call-schedule",
    tags=["call-schedule"],
)


class CallScheduleEntry(BaseModel):
    location: str = Field("", description="Location name or code")
    practitioner: str = Field("", description="On-call practitioner display name")


class CallScheduleDay(BaseModel):
    date: str = Field(..., description="ISO date (YYYY-MM-DD)")
    north: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for North Pod")
    central: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for Central Pod")
    south: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for South Pod")


class CallScheduleWeekRequest(BaseModel):
    week_start: str = Field(..., description="ISO date (YYYY-MM-DD) for Sunday of the week")
    days: Dict[str, Dict[str, Any]] | None = None


@router.post("/week")
async def save_call_schedule_week(
    payload: CallScheduleWeekRequest,
    current_user: SessionUser = Depends(require_modmed_session),
):
    """
    Save or update the on-call schedule for a single week.
    Client sends 7 days (Sun–Sat) in `days`, keyed by date, each with north/central/south entries.
    """
    if not payload.days:
        raise HTTPException(status_code=400, detail="No days provided")

    def normalize_entries(entries: Any) -> list[Dict[str, str]]:
        result: list[Dict[str, str]] = []
        if not isinstance(entries, list):
            return result
        for e in entries:
            if not isinstance(e, dict):
                continue
            loc = str(e.get("location") or "").strip()
            practitioner = str(e.get("practitioner") or "").strip()
            if not loc and not practitioner:
                continue
            result.append({"location": loc, "practitioner": practitioner})
        return result

    day_mapping: Dict[str, Dict[str, Any]] = {}
    for key, raw_day in payload.days.items():
        date_key = (raw_day.get("date") or key).strip()
        day_mapping[date_key] = {
            "North Pod": normalize_entries(raw_day.get("north")),
            "Central Pod": normalize_entries(raw_day.get("central")),
            "South Pod": normalize_entries(raw_day.get("south")),
        }

    audit_meta = {
        "email": current_user.email,
        "auth_method": current_user.auth_method,
        "practice_url": current_user.practice_url,
        "is_admin": current_user.is_admin,
        "source": "week_save",
        "upload_filename": None,
    }
    update_week(payload.week_start, day_mapping, audit_meta=audit_meta)
    return {"success": True, "updated_keys": list(day_mapping.keys())}


@router.get("")
async def get_call_schedule(
    start: str,
    end: str,
    current_user: SessionUser = Depends(require_modmed_session),
):
    """
    Get call schedule entries for an inclusive date range.
    """
    data = get_call_schedule_range(start, end)
    return {"call_schedule": data}


@router.get("/audit")
async def list_call_schedule_audit(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    admin: SessionUser = Depends(require_admin),
):
    """
    Newest-first audit log of call schedule changes (who changed what and when).
    """
    entries = get_audit_entries(limit=limit, offset=offset)
    return {"audit": entries, "limit": limit, "offset": offset}


UPLOAD_READ_TIMEOUT_SECONDS = 30
UPLOAD_PARSE_SAVE_TIMEOUT_SECONDS = 30


def _parse_and_save_upload(
    contents: bytes,
    filename: str,
    audit_user: Optional[Dict[str, Any]] = None,
) -> dict:
    """Synchronous parse + save so it can run in executor with a timeout."""
    day_mapping = parse_call_schedule_upload(contents, filename=filename)
    if not day_mapping:
        raise ValueError("No schedule entries found in uploaded file")
    sorted_dates = sorted(day_mapping.keys())
    week_start = sorted_dates[0]
    audit_meta = None
    if audit_user:
        audit_meta = {
            **audit_user,
            "source": "upload",
            "upload_filename": filename or None,
        }
    update_week(week_start, day_mapping, audit_meta=audit_meta)
    return {"success": True, "updated_keys": sorted_dates}


@router.post("/upload")
async def upload_call_schedule(
    file: UploadFile = File(...),
    current_user: SessionUser = Depends(require_modmed_session),
):
    """
    Upload a call schedule spreadsheet (CSV or XLSX).
    Layout is auto-detected: header row (first row with dates), pod column (North/Central/South Pod), date columns.
    """
    filename = file.filename or ""
    try:
        contents = await asyncio.wait_for(
            file.read(),
            timeout=UPLOAD_READ_TIMEOUT_SECONDS,
        )
        audit_user = {
            "email": current_user.email,
            "auth_method": current_user.auth_method,
            "practice_url": current_user.practice_url,
            "is_admin": current_user.is_admin,
        }
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: _parse_and_save_upload(contents, filename, audit_user),
            ),
            timeout=UPLOAD_PARSE_SAVE_TIMEOUT_SECONDS,
        )
        return result
    except HTTPException:
        raise
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=408,
            detail="Upload timed out. Try a smaller file or check your connection",
        ) from None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse uploaded call schedule")

