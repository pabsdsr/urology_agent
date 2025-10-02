from fastapi import APIRouter, Depends, HTTPException
import httpx
import os
import logging
from app.routes.auth import get_current_user
from app.models import SessionUser

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/all_patients",
    tags=["all_patients"]
)

@router.get("")
async def all_patients(current_user: SessionUser = Depends(get_current_user)):
    headers = {
        "x-api-key": current_user.practice_api_key,
        "Authorization": f"Bearer {current_user.modmed_access_token}"
    }
    prefix = current_user.practice_url

    patients = []
    url = f"https://stage.ema-api.com/ema-dev/firm/{prefix}/ema/fhir/v2/Patient"

    try:
        async with httpx.AsyncClient() as client:
            while url:
                response = await client.get(url, headers=headers)
                
                if response.status_code != 200:
                    logger.error("ModMed API error fetching patients", 
                               extra={"practice_url": prefix, "status_code": response.status_code, 
                                     "username": current_user.username})
                    raise HTTPException(status_code=502, detail="Failed to fetch patient list")
                
                data = response.json()

                entries = data.get("entry", [])
                for patient in entries:
                    resource = patient.get("resource", {})
                    if not resource:
                        continue
                    id = resource.get("id")
                    name = resource.get("name", [{}])[0]
                    family_name = name.get("family", "")
                    given_names = name.get("given", [""])
                    given_name = given_names[0] if given_names else ""

                    patients.append({
                        "id": id,
                        "familyName": family_name,
                        "givenName": given_name
                    })

                # Find the next page URL
                next_url = None
                for link in data.get("link", []):
                    if link.get("relation") == "next":
                        next_url = link.get("url")
                        break
                url = next_url

        logger.info("Patient list fetched successfully", 
                   extra={"practice_url": prefix, "patient_count": len(patients), 
                         "username": current_user.username})
        
        return patients
        
    except HTTPException:
        # Re-raise HTTP exceptions (already properly formatted)
        raise
    except Exception as e:
        logger.exception("Failed to fetch patient list", 
                        extra={"practice_url": prefix, "username": current_user.username})
        raise HTTPException(status_code=500, detail="Failed to fetch patient list")