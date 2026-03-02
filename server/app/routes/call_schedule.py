from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, List

from app.models import SessionUser
from app.routes.auth import get_current_user
from app.services.call_schedule_service import update_week, get_call_schedule_range


router = APIRouter(
    prefix="/call-schedule",
    tags=["call-schedule"],
)


class CallScheduleEntry(BaseModel):
    location: str = Field("", description="Location name or code")
    practitioner: str = Field("", description="On-call practitioner display name")


class CallScheduleDay(BaseModel):
    date: str = Field(..., description="ISO date (YYYY-MM-DD)")
    north: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for North pod")
    central: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for Central pod")
    south: List[CallScheduleEntry] = Field(default_factory=list, description="Entries for South pod")


class CallScheduleWeekRequest(BaseModel):
    week_start: str = Field(..., description="ISO date (YYYY-MM-DD) representing the Monday of the week")
    # Accept a flexible dict of raw day data from the client
    days: Dict[str, Dict[str, Any]] | None = None


@router.post("/week")
async def save_call_schedule_week(
    payload: CallScheduleWeekRequest,
    current_user: SessionUser = Depends(get_current_user),
):
    """
    Save or update the on-call schedule for a single week.

    The client is expected to send 7 entries (Mon–Sun) in `days`,
    keyed by date string, each with north/central/south practitioner names.
    """
    if not payload.days:
        raise HTTPException(status_code=400, detail="No days provided")

    day_mapping: Dict[str, Dict[str, Any]] = {}
    for key, raw_day in payload.days.items():
        # raw_day is a plain dict from JSON, not a Pydantic model
        date_key = (raw_day.get("date") or key).strip()

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

        day_mapping[date_key] = {
            "North pod": normalize_entries(raw_day.get("north")),
            "Central pod": normalize_entries(raw_day.get("central")),
            "South pod": normalize_entries(raw_day.get("south")),
        }

    updated = update_week(payload.week_start, day_mapping)
    return {"success": True, "updated_keys": list(day_mapping.keys())}


@router.get("")
async def get_call_schedule(
    start: str,
    end: str,
    current_user: SessionUser = Depends(get_current_user),
):
    """
    Get call schedule entries for an inclusive date range.
    """
    data = get_call_schedule_range(start, end)
    return {"call_schedule": data}


