from fastapi import APIRouter
import httpx
import os
from app.services.token_service import token_service

router = APIRouter(
    prefix="/all_patients",
    tags=["all_patients"]
)

@router.get("")
async def all_patients():
    token = await token_service.get_token()
    headers = {
        "x-api-key": os.environ.get("modmed_api_key"),
        "Authorization": f"Bearer {token}"
    }
    prefix= os.environ.get("modmed_url_prefix")

    patients = []
    url = f"https://stage.ema-api.com/ema-dev/firm/{prefix}/ema/fhir/v2/Patient"

    async with httpx.AsyncClient() as client:
        while url:
            response = await client.get(url, headers=headers)
            response.raise_for_status()
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

    return patients