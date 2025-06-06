from fastapi import APIRouter
import httpx
import asyncio
import os
import json
from app.services.token_service import token_service


router = APIRouter(
    prefix = "/patient_info",
    tags = ["patient_info"]
)

@router.get("/{id}")
async def get_patient_info(id):
    token = await token_service.get_token()
    headers={
                "x-api-key": os.environ.get("modmed_api_key"),
                "Authorization": f"Bearer {token}"
            }
    urls = [
        # Patient info
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/{id}",

        # Encounters
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Encounter?patient={id}",

        # Documents
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DocumentReference?patient={id}", 

        # Clinical data
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/MedicationStatement?patient={id}", # medication statement
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/AllergyIntolerance?patient={id}", # allergies
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Condition?patient={id}", # conditions
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/FamilyMemberHistory?patient={id}", # family history
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DiagnosticReport?patient={id}", # diagnostic report
        
        # Tasks
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Task?code=PMRECALL&patient={id}"
    ]

    async with httpx.AsyncClient() as client:
        tasks = [client.get(url, headers=headers) for url in urls]
        responses = await asyncio.gather(*tasks)

        results = [response.json() for response in responses]

    filename = f"{id}.json"
    filepath = os.path.join("../ai/knowledge", filename)
    with open(filepath, 'w') as f:
        json.dump(results, f, indent=2)

    return results