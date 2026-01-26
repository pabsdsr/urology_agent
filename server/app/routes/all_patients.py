from fastapi import APIRouter, Depends, HTTPException, Query
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
async def all_patients(
    current_user: SessionUser = Depends(get_current_user),
    name: str = Query(None, description="Search by patient name")
):
    """
    Get patients - with optional name search
    If name parameter provided, searches for patients matching that name
    Otherwise, returns first 5 pages of patients
    """
    headers = {
        "x-api-key": current_user.practice_api_key,
        "Authorization": f"Bearer {current_user.modmed_access_token}"
    }
    prefix = current_user.practice_url

    patients = []
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # If name is provided, search for specific patient
            if name:
                url = f"https://mmapi.ema-api.com/ema-prod/firm/{prefix}/ema/fhir/v2/Patient?name={name}"
            else:
                url = f"https://mmapi.ema-api.com/ema-prod/firm/{prefix}/ema/fhir/v2/Patient"
            
            page_count = 0
            max_pages = 1 if name else 5  # If searching by name, get only first page; otherwise get 5 pages
            
            while url and page_count < max_pages:
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
                    name_obj = resource.get("name", [{}])[0]
                    family_name = name_obj.get("family", "")
                    given_names = name_obj.get("given", [""])
                    given_name = given_names[0] if given_names else ""

                    patients.append({
                        "id": id,
                        "familyName": family_name,
                        "givenName": given_name
                    })

                page_count += 1
                
                # Find the next page URL (but stop if we've hit max_pages)
                if page_count >= max_pages:
                    url = None
                else:
                    next_url = None
                    for link in data.get("link", []):
                        if link.get("relation") == "next":
                            next_url = link.get("url")
                            break
                    url = next_url

        logger.info("Patient list fetched successfully", 
                   extra={"practice_url": prefix, "patient_count": len(patients), 
                         "search_name": name, "username": current_user.username})
        
        return patients
        
    except HTTPException:
        # Re-raise HTTP exceptions (already properly formatted)
        raise
    except Exception as e:
        logger.exception("Failed to fetch patient list", 
                        extra={"practice_url": prefix, "username": current_user.username})
        raise HTTPException(status_code=500, detail="Failed to fetch patient list")