from fastapi import APIRouter, UploadFile, File, HTTPException
import httpx
import os
from app.services.token_service import token_service
from datetime import datetime, timezone


router = APIRouter(
    prefix="/add_document",
    tags=["add_document"]
)

@router.post("")
async def add_document(file: UploadFile = File(...)):
    s3_url = await retrieve_s3_url()
    await upload_file(s3_url, file)

    token = await token_service.get_token()
    headers = {
        "x-api-key": os.environ.get("modmed_api_key"),
        "Authorization": f"Bearer {token}"
    }

    url = "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/DocumentReference?patient=296020"
    
    payload = {
        "resourceType": "DocumentReference",
        "status": "current",
        "type": {
            "text": "application/pdf"
        },
        "category": [
            {
                "coding": [
                    {
                        "system": "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/ValueSet/document-category",
                        "code": "22901",  # e.g. Clinical Results
                        "display": "Clinical Results"
                    }
                ],
                "text": "Clinical Results"
            }
        ],
        "subject": {
            "reference": "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Patient/296020"
        },
        "date": datetime.now(timezone.utc).isoformat(),
        "description": file.filename,
        "identifier": [
            {
                "system": "filename",
                "value": file.filename
            }
        ],
        "content": [
            {
                "attachment": {
                    "contentType": "application/pdf",
                    "url": s3_url,
                    "title": file.filename,
                    "creation": datetime.now(timezone.utc).isoformat()
                }
            }
        ]
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        if response.content:
            return response.json()
        else:
            return {"message": "Document uploaded successfully", "status": response.status_code}


async def retrieve_s3_url():
    token = await token_service.get_token()
    headers = {
        "x-api-key": os.environ.get("modmed_api_key"),
        "Authorization": f"Bearer {token}"
    }

    url = "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/fhir/v2/Binary"

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        s3_url = data["issue"][0]["details"]["text"]

    return s3_url


async def upload_file(s3_url: str, file: UploadFile = File(...)):
    content = await file.read()
    headers = {
        "Content-Type": "text/plain" 
    }

    async with httpx.AsyncClient() as client:
        response = await client.put(s3_url, content=content, headers=headers)

    if response.status_code not in (200, 201):
        raise HTTPException(status_code=500, detail=f"Upload failed with status code {response.status_code}")

    return {"message": "File uploaded successfully"}


