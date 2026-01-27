from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
import os
import asyncio
from app.routes.auth import get_current_user
from app.models import SessionUser

router = APIRouter(
    prefix="/patients",
    tags=["patients"]
)

@router.get("")
async def search_patients(
    current_user: SessionUser = Depends(get_current_user),
    given: str = Query(None, description="Given (first) name, partial allowed"),
    family: str = Query(None, description="Family (last) name, exact match")
):
    """
    Search for patients by given and/or family name using FHIR API. Supports typeahead/autocomplete.
    """
    headers = {
        "x-api-key": current_user.practice_api_key,
        "Authorization": f"Bearer {current_user.modmed_access_token}"
    }
    prefix = current_user.practice_url

    base_url = f"https://mmapi.ema-api.com/ema-prod/firm/{prefix}/ema/fhir/v2/Patient"
    params = []
    if given:
        params.append(f"given={given}")
    if family:
        params.append(f"family={family}")
    if not params:
        raise HTTPException(status_code=400, detail="At least one of 'given' or 'family' must be provided.")
    url = base_url + "?" + "&".join(params)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Failed to fetch patient list")
            data = response.json()
            entries = data.get("entry", [])
            patients = []
            for patient in entries:
                resource = patient.get("resource", {})
                if not resource:
                    continue
                id = resource.get("id")
                name_obj = resource.get("name", [{}])[0]
                family_name = name_obj.get("family", "")
                given_names = name_obj.get("given", [""])
                given_name = given_names[0] if given_names else ""
                dob = resource.get("birthDate", "")
                patients.append({
                    "id": id,
                    "familyName": family_name,
                    "givenName": given_name,
                    "dob": dob
                })
            return patients
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch patient list")
