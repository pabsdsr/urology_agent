import httpx
import asyncio
import os
import json
from app.services.token_service import token_service
from fastapi import APIRouter
import base64
from io import BytesIO
from PyPDF2 import PdfReader
import xmltodict


# router = APIRouter(
#     prefix="/patient_info",
#     tags=["patient_info"]
# )

# @router.post("")
async def get_patient_info(id: str):
    token = await token_service.get_token()
    headers = {
        "x-api-key": os.environ.get("modmed_api_key"),
        "Authorization": f"Bearer {token}"
    }
    prefix = os.environ.get("modmed_url_prefix")

    base_url = f"https://stage.ema-api.com/ema-dev/firm/{prefix}/ema/fhir/v2"
    
    urls = [
        f"{base_url}/Patient/{id}",
        f"{base_url}/Encounter?patient={id}",
        f"{base_url}/MedicationStatement?patient={id}",
        f"{base_url}/AllergyIntolerance?patient={id}",
        f"{base_url}/Condition?patient={id}",
        f"{base_url}/FamilyMemberHistory?patient={id}",
        f"{base_url}/DiagnosticReport?patient={id}",
        f"{base_url}/Task?code=PMRECALL&patient={id}"
    ]

    async with httpx.AsyncClient() as client:
        tasks = [client.get(url, headers=headers) for url in urls]
        responses = await asyncio.gather(*tasks)

        results = [r.json() for r in responses]

        # Documents
        doc_ref_url = f"{base_url}/DocumentReference?patient={id}"
        doc_response = await client.get(doc_ref_url, headers=headers)
        doc_data = doc_response.json()

        doc_entries = doc_data.get("entry", [])
        files = []

        for entry in doc_entries:
            full_url = entry.get("fullUrl")
            if not full_url:
                continue

            full_response = await client.get(full_url, headers=headers)
            doc_json = full_response.json()

            contents = doc_json.get("content", [])
            for content in contents:
                attachment = content.get("attachment", {})
                content_type = attachment.get("contentType", "")
                file_url = attachment.get("url")
                title = attachment.get("title", "file")

                if not file_url:
                    continue

                file_response = await client.get(file_url)
                if file_response.status_code != 200:
                    files.append({
                        "title": title,
                        "error": f"Failed to download file, status {file_response.status_code}"
                    })
                    continue

                if content_type == "application/pdf":
                    file_bytes = file_response.content
                    file_b64 = base64.b64encode(file_bytes).decode("utf-8")
                    file_b64_parsed = parse_base64_pdf(file_b64)
                    files.append({
                        "title": title,
                        "content_base64": file_b64_parsed,
                        "contentType": content_type,
                        "creation": attachment.get("creation")
                    })

                elif content_type in ["application/xml"]:
                    xml_text = file_response.text
                    try:
                        xml_parsed = xmltodict.parse(xml_text)
                    except Exception as e:
                        xml_parsed = None
                    files.append({
                        "title": title,
                        "content_xml": xml_parsed if xml_parsed else xml_text,
                        "contentType": content_type,
                        "creation": attachment.get("creation")
                    })
                else:
                    pass

    results.append({"documents": files})

    dir_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "crew", "knowledge"))
    filepath = os.path.join(dir_path, f"{id}.json")
    try:
        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2)
    except Exception as e:
        print(f"Error writing file: {e}")

    return results


def parse_base64_pdf(base64_string):
    pdf_bytes = base64.b64decode(base64_string)
    reader = PdfReader(BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text