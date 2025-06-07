from fastapi import APIRouter
import httpx
import asyncio
import os
from app.services.token_service import token_service


router = APIRouter(
    prefix = "/patient_info",
    tags = ["patient_info"]
)

@router.get("")
async def get_patient_info(
    id = "295795"
):
    token = await token_service.get_token()
    headers={
                "x-api-key": os.environ.get("modmed_api_key"),
                "Authorization": f"Bearer {token}"
            }
    urls = [
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/{id}", # patient
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Encounter?patient={id}", # encounters
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DocumentReference?patient={id}", # documents

        # Clinical data
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/MedicationStatement?patient={id}", # medication statement
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/AllergyIntolerance?patient={id}", # allergies
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Condition?patient={id}", # conditions
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/FamilyMemberHistory?patient={id}", # family history
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/ServiceRequest?patient={id}", # service requests
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DiagnosticReport?patient={id}", # diagnostic report
        
        # f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/{id}", # tasks

        # maybe add practioners and tasks need to ask my dad
    ]

    async with httpx.AsyncClient() as client:
        tasks = [client.get(url, headers=headers) for url in urls]
        responses = await asyncio.gather(*tasks)

        results = [response.json() for response in responses]

    return results