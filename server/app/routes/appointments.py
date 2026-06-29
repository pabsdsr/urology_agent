from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException
from app.services.appointment_service import (
    get_appointments_by_date,
    get_practitioner_schedule_by_date,
    get_appointment_type_id_to_name,
    get_surgery_location_ids,
    get_practitioner_and_location_names,
)
from app.models import SessionUser
from app.routes.auth import require_modmed_session

router = APIRouter(
    prefix="/schedule",
    tags=["schedule"]
)

logger = logging.getLogger(__name__)


def _schedule_params(current_user: SessionUser):
    """Extract ModMed API params from authenticated user."""
    return (
        current_user.modmed_access_token,
        f"https://mmapi.ema-api.com/ema-prod/firm/{current_user.practice_url}/ema/fhir/v2",
        current_user.practice_api_key,
    )


def _parse_query_date(value: str, field: str):
    """Parse a YYYY-MM-DD query param, raising 400 (not 500) on bad input."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"'{field}' must be a valid YYYY-MM-DD date.")


@router.get("")
async def practitioner_schedule_by_date(
    start: str,
    end: str,
    current_user: SessionUser = Depends(require_modmed_session)
):
    """Return practitioner schedule payload for an inclusive date range."""
    modmed_token, base_url, practice_api_key = _schedule_params(current_user)
    result = await get_practitioner_schedule_by_date(
        start,
        end,
        modmed_token,
        base_url,
        practice_api_key,
        current_user.practice_url,
    )
    return result


@router.get("/appointment_types")
async def list_appointment_types(
    start: str | None = None,
    end: str | None = None,
    current_user: SessionUser = Depends(require_modmed_session)
):
    """Return appointment type and surgery location mappings for a date range."""
    today = datetime.now(timezone.utc).date()
    end_dt = today if end is None else _parse_query_date(end, "end")
    start_dt = (end_dt - timedelta(days=7)) if start is None else _parse_query_date(start, "start")

    modmed_token, base_url, practice_api_key = _schedule_params(current_user)

    all_appointments = []
    seen = set()
    d = start_dt
    while d <= end_dt:
        day_str = d.strftime("%Y-%m-%d")
        appts = await get_appointments_by_date(day_str, day_str, modmed_token, base_url, practice_api_key)
        for a in appts:
            key = (a.get("start"), a.get("end"), a.get("patient_id"))
            if key not in seen:
                seen.add(key)
                all_appointments.append(a)
        d += timedelta(days=1)

    id_to_name = get_appointment_type_id_to_name(all_appointments)
    surgery_loc_ids = get_surgery_location_ids(all_appointments)
    sorted_items = sorted(id_to_name.items(), key=lambda x: (x[0] or "", x[1] or ""))

    # Resolve surgery location IDs to names
    _, location_names, _, _ = await get_practitioner_and_location_names(
        base_url, modmed_token, practice_api_key, logger
    )
    surgery_locations = [{"id": lid, "name": location_names.get(lid) or "(unknown)"} for lid in surgery_loc_ids]

    return {
        "appointment_types": dict(sorted_items),
        "appointments_scanned": len(all_appointments),
        "surgery_location_ids": surgery_loc_ids,
        "surgery_locations": surgery_locations,
    }
