from fastapi import APIRouter, Depends, HTTPException, Query
import httpx
import os
import logging
import asyncio
from app.routes.auth import get_current_user
from app.models import SessionUser

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/all_patients",
    tags=["all_patients"]
)

@router.get("")
async def all_patients(
    current_user: SessionUser = Depends(get_current_user),
    name: str = Query(None, description="Search by patient name")
):
    """
    Get patients - with optional name search
    If name parameter provided, searches for patients matching that name (using name, given, and family)
    Otherwise, returns first page of patients only (to avoid timeouts)
    """
    headers = {
        "x-api-key": current_user.practice_api_key,
        "Authorization": f"Bearer {current_user.modmed_access_token}"
    }
    prefix = current_user.practice_url

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            patients = {}
            if name:
                # Try all FHIR search params in parallel
                base_url = f"https://mmapi.ema-api.com/ema-prod/firm/{prefix}/ema/fhir/v2/Patient"
                search_urls = [
                    ("name", f"{base_url}?name={name}"),
                    ("given", f"{base_url}?given={name}"),
                    ("family", f"{base_url}?family={name}")
                ]
                responses = await asyncio.gather(*[
                    client.get(url, headers=headers) for _, url in search_urls
                ])
                for (param, url), response in zip(search_urls, responses):
                    if response.status_code != 200:
                        logger.warning(f"ModMed API error for {param} search", extra={"practice_url": prefix, "status_code": response.status_code, "username": current_user.username, "url": url})
                        continue
                    data = response.json()
                    logger.info(f"FHIR {param} search response", extra={"practice_url": prefix, "param": param, "count": len(data.get('entry', [])), "search_name": name})
                    entries = data.get("entry", [])
                    for patient in entries:
                        resource = patient.get("resource", {})
                        if not resource:
                            continue
                        id = resource.get("id")
                        name_obj = resource.get("name", [{}])[0]
                        family_name = name_obj.get("family", "")
                        given_names = name_obj.get("given", [""])
                        given_name = given_names[0] if given_names else ""
                        # Use id as unique key
                        patients[id] = {
                            "id": id,
                            "familyName": family_name,
                            "givenName": given_name
                        }
            else:
                # Only return first page to avoid timeouts
                url = f"https://mmapi.ema-api.com/ema-prod/firm/{prefix}/ema/fhir/v2/Patient"
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    logger.error("ModMed API error fetching patients", extra={"practice_url": prefix, "status_code": response.status_code, "username": current_user.username})
                    raise HTTPException(status_code=502, detail="Failed to fetch patient list")
                data = response.json()
                entries = data.get("entry", [])
                for patient in entries:
                    resource = patient.get("resource", {})
                    if not resource:
                        continue
                    id = resource.get("id")
                    name_obj = resource.get("name", [{}])[0]
                    family_name = name_obj.get("family", "")
                    given_names = name_obj.get("given", [""])
                    given_name = given_names[0] if given_names else ""
                    patients[id] = {
                        "id": id,
                        "familyName": family_name,
                        "givenName": given_name
                    }

        logger.info("Patient list fetched successfully", extra={"practice_url": prefix, "patient_count": len(patients), "search_name": name, "username": current_user.username})
        return list(patients.values())

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to fetch patient list", extra={"practice_url": prefix, "username": current_user.username, "error": str(e)})
        raise HTTPException(status_code=500, detail="Failed to fetch patient list")