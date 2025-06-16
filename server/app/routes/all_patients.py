from fastapi import APIRouter
import httpx
import os
from app.services.token_service import token_service

router = APIRouter(
    prefix = "/all_patients",
    tags = ["all_patients"]
)

@router.get("")
async def get_all_patients():
    token = await token_service.get_token()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient",
            headers={
                "x-api-key": os.environ.get("modmed_api_key"),
                "Authorization": f"Bearer {token}"
            }
        )

    data = response.json()

    results = []

    for patient in data.get("entry", []):
        id = patient["resource"]["id"]
        family_name = patient["resource"]["name"][0]["family"]
        given_name = patient["resource"]["name"][0]["given"][0]
        results.append({
            "id": id,
            "familyName": family_name,
            "givenName": given_name
        })

    return results