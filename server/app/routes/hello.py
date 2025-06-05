from fastapi import APIRouter
import httpx
import os
from app.services.token_service import token_service

router = APIRouter(
    prefix = "/hello",
    tags = ["hello"]
)

@router.get("")
async def hello_world():
    token = await token_service.get_token()
    patient_response = httpx.get("https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/295752",
                            headers= {
                                "x-api-key" : os.environ.get("modmed_api_key"),
                                "Authorization" : f"Bearer {token}"
                            }
                        )
    return patient_response.json()


