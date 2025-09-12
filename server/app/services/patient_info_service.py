import httpx
import asyncio
import os
import json
import hashlib
import uuid
import base64
import xmltodict
import copy
from io import BytesIO
from PyPDF2 import PdfReader
from app.services.token_service import token_service
from app.services.client_service import client
from app.crew.tools.tools import qdrant_tool
from app.services.patient_embedder import PatientDataEmbedder
from fastapi import APIRouter

def parse_base64_pdf(base64_string):
    """Parse base64 encoded PDF string and extract text"""
    pdf_bytes = base64.b64decode(base64_string)
    reader = PdfReader(BytesIO(pdf_bytes))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    return text

def parse_xml_blocking(xml_text: str):
    """Parse XML safely in a blocking thread."""
    try:
        return xmltodict.parse(xml_text)
    except Exception:
        return xml_text

def clean_patient_resource(resource):
    """Remove metadata fields from patient resource"""
    cleaned_copy = copy.deepcopy(resource)
    fields_to_eliminate = ['meta', 'id', 'fullUrl', 'link']

    for field in fields_to_eliminate:
        cleaned_copy.pop(field, None)

    return cleaned_copy

def clean_patient_bundle_entry(entry):
    """Clean individual bundle entry"""
    cleaned_entry = copy.deepcopy(entry)
    cleaned_entry.pop('fullUrl', None)

    if 'resource' in cleaned_entry:
        cleaned_entry['resource'] = clean_patient_resource(cleaned_entry['resource'])
    
    return cleaned_entry

def clean_patient_data(patient_data):
    """Clean patient data by removing metadata and sensitive fields"""
    cleaned_data = []

    for item in patient_data:
        if item.get("resourceType") == "Bundle":
            cleaned_bundle = clean_patient_resource(item)
            if "entry" in cleaned_bundle:
                cleaned_bundle['entry'] = [
                    clean_patient_bundle_entry(entry) 
                    for entry in cleaned_bundle['entry']
                ]
            cleaned_data.append(cleaned_bundle)
        else:
            cleaned_data.append(clean_patient_resource(item))
    
    return cleaned_data

def hash_patient_data(patient_data):
    """Create a hash of patient data for change detection"""
    cleaned_data = clean_patient_data(patient_data)
    normalized_objects = [
        json.dumps(obj, sort_keys=True, separators=(',', ':'))
        for obj in cleaned_data
    ]

    patient_text = "[" + ",".join(normalized_objects) + "]"

    return hashlib.sha256(patient_text.encode("utf-8")).hexdigest()


# Rate limiter (max concurrent requests)
MAX_CONCURRENT_REQUESTS = 300
semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

async def limited_get(client: httpx.AsyncClient, url: str, headers: dict = None):
    """Wrap client.get with a semaphore for rate limiting."""
    async with semaphore:
        try:
            return await client.get(url, headers=headers)
        except Exception as e:
            return e

router = APIRouter(
    prefix="/patient_info",
    tags=["patient_info"]
)


@router.post("")
async def get_patient_info(id: str):
    """
    Fetch patient information from Modmed endpoints and process for embedding storage.
    """
    try:
        token = await token_service.get_token()
        headers = {
            "x-api-key": os.environ.get("modmed_api_key"),
            "Authorization": f"Bearer {token}"
        }

        prefix = os.environ.get("modmed_url_prefix")
        base_url = f"https://stage.ema-api.com/ema-dev/firm/{prefix}/ema/fhir/v2"

        section_urls = {
            "patient": f"{base_url}/Patient/{id}",
            "encounters": f"{base_url}/Encounter?patient={id}",
            "medications": f"{base_url}/MedicationStatement?patient={id}",
            "allergies": f"{base_url}/AllergyIntolerance?patient={id}",
            "conditions": f"{base_url}/Condition?patient={id}",
            "family_history": f"{base_url}/FamilyMemberHistory?patient={id}",
            "diagnostic_reports": f"{base_url}/DiagnosticReport?patient={id}",
            "tasks": f"{base_url}/Task?code=PMRECALL&patient={id}",
            "document_references": f"{base_url}/DocumentReference?patient={id}",  # Added this!
        }

        # --- Parallel fetch all sections using global client ---
        tasks = {name: limited_get(client, url, headers) for name, url in section_urls.items()}
        responses = await asyncio.gather(*tasks.values(), return_exceptions=True)

        results = {}
        doc_entries = []

        for name, resp in zip(tasks.keys(), responses):
            if isinstance(resp, Exception) or resp.status_code != 200:
                continue

            if name == "document_references":
                doc_data = resp.json()
                doc_entries = doc_data.get("entry", [])
            else:
                results[name] = resp.json()

        if doc_entries:
            doc_urls = [entry.get("fullUrl") for entry in doc_entries if entry.get("fullUrl")]
            doc_tasks = [limited_get(client, url, headers) for url in doc_urls]
            doc_responses = await asyncio.gather(*doc_tasks, return_exceptions=True)

            all_file_info = []
            for doc_resp in doc_responses:
                if not isinstance(doc_resp, httpx.Response) or doc_resp.status_code != 200:
                    continue
                doc_json = doc_resp.json()
                contents = doc_json.get("content", [])
                for content in contents:
                    attachment = content.get("attachment", {})
                    file_url = attachment.get("url")
                    if file_url:
                        all_file_info.append((file_url, attachment))

            if all_file_info:
                all_file_tasks = [limited_get(client, url) for url, _ in all_file_info]
                all_file_responses = await asyncio.gather(*all_file_tasks, return_exceptions=True)

                files = []
                for (url, attachment), file_resp in zip(all_file_info, all_file_responses):
                    if not isinstance(file_resp, httpx.Response) or file_resp.status_code != 200:
                        files.append({
                            "title": attachment.get("title", "file"),
                            "error": f"Failed to fetch {url}"
                        })
                        continue

                    content_type = attachment.get("contentType", "")
                    title = attachment.get("title", "file")

                    if content_type == "application/pdf":
                        file_bytes = file_resp.content
                        file_b64 = base64.b64encode(file_bytes).decode("utf-8")
                        file_b64_parsed = await asyncio.to_thread(parse_base64_pdf, file_b64)
                        files.append({
                            "title": title,
                            "content_base64": file_b64_parsed,
                            "contentType": content_type,
                            "creation": attachment.get("creation")
                        })
                    elif content_type == "application/xml":
                        xml_text = file_resp.text
                        xml_parsed = await asyncio.to_thread(parse_xml_blocking, xml_text)
                        files.append({
                            "title": title,
                            "content_xml": xml_parsed,
                            "contentType": content_type,
                            "creation": attachment.get("creation")
                        })

            if files:
                results["documents"] = files

        embedder = PatientDataEmbedder(
            qdrant_url=os.getenv("QDRANT_URL"),
            qdrant_api_key=os.getenv("QDRANT_API_KEY")
        )

        qdrant_tool.delete_all_points()
        
        all_sections_to_embed = []

        for section_name, section_data in results.items():
            if not section_data:
                continue

            if section_name == "documents":
                for doc in section_data:
                    section_list = [{doc["title"]: doc}]
                    current_hash = hash_patient_data(section_list)
                    previous_hash = qdrant_tool.find_hash_embedding(current_hash)

                    if not previous_hash or previous_hash != current_hash:
                        if previous_hash:
                            qdrant_tool.delete_points_by_patient_hash(previous_hash)
                        all_sections_to_embed.append((section_list, doc["title"], current_hash))
            else:
                section_list = [{section_name: section_data}]
                current_hash = hash_patient_data([results[section_name]])
                previous_hash = qdrant_tool.find_hash_embedding(current_hash)

                if not previous_hash or previous_hash != current_hash:
                    if previous_hash:
                        qdrant_tool.delete_points_by_patient_hash(previous_hash)
                    all_sections_to_embed.append((section_list, section_name, current_hash))

        # Now embed everything in parallel
        await asyncio.gather(*[
            asyncio.to_thread(embedder.chunk_and_embed, section_list, name, id, h)
            for section_list, name, h in all_sections_to_embed
        ])

        return True

    except Exception as e:
        print(f"ERROR: Error in get_patient_info for patient {id}: {e}")
        return False
