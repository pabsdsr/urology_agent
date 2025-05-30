from fastapi import APIRouter
import httpx
import os
import json
from app.services.token_service import token_service


router = APIRouter(
    prefix = "/id",
    tags = ["id"]
)

@router.get("")
async def get_id(
    given = "Female",
    family = "Test"
):
    token = await token_service.get_token()
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient?given={given}&family={family}",
            headers={
                "x-api-key": os.environ.get("modmed_api_key"),
                "Authorization": f"Bearer {token}"
            }
        )

    data = response.json()
    id = data["entry"][0]["resource"]["id"]

    return id