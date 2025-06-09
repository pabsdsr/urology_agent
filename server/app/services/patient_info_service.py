import httpx
import asyncio
import os
import json
from app.services.token_service import token_service


async def get_patient_info(id: str):
    token = await token_service.get_token()
    headers = {
        "x-api-key": os.environ.get("modmed_api_key"),
        "Authorization": f"Bearer {token}"
    }

    urls = [
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/{id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Encounter?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DocumentReference?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/MedicationStatement?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/AllergyIntolerance?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Condition?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/FamilyMemberHistory?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DiagnosticReport?patient={id}",
        f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Task?code=PMRECALL&patient={id}"
    ]

    async with httpx.AsyncClient() as client:
        tasks = [client.get(url, headers=headers) for url in urls]
        responses = await asyncio.gather(*tasks)

        results = [response.json() for response in responses]

    dirpath = f"../ai/knowledge/{id}"
    os.makedirs(dirpath, exist_ok=True)
    filepath = os.path.join(dirpath, f"{id}.json")
    with open(filepath, 'w') as f:
        json.dump(results, f, indent=2)

    return
