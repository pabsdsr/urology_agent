import httpx
import asyncio
import os
import json
import hashlib
import uuid

from app.services.token_service import token_service
import copy
from app.services.patient_embedder import PatientDataEmbedder
from qdrant_client.http.models import Filter, FieldCondition, MatchValue
from qdrant_client.models import PointStruct
from app.crew.tools.tools import qdrant_tool

def clean_patient_resource(resource):
    cleaned_copy = copy.deepcopy(resource)

    fields_to_eliminate = ['meta', 'id', 'fullUrl', 'link']

    for field in fields_to_eliminate:
        cleaned_copy.pop(field, None)

    return cleaned_copy

def clean_patient_bundle_entry(entry):
    cleaned_entry = copy.deepcopy(entry)
    cleaned_entry.pop('fullUrl', None)

    if 'resource' in cleaned_entry:
        cleaned_entry['resource'] = clean_patient_resource(cleaned_entry['resource'])
    
    return cleaned_entry

def clean_patient_data(patient_data):
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
    cleaned_data = clean_patient_data(patient_data)
    normalized_objects = [
        json.dumps(obj, sort_keys=True, separators=(',', ':'))
        for obj in cleaned_data
    ]

    patient_text = "[" + ",".join(normalized_objects) + "]"
    return hashlib.sha256(patient_text.encode("utf-8")).hexdigest()


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
    
    hashed_patient_val = hash_patient_data(results)

    # only here for testing purposes
    embedder = PatientDataEmbedder(
        qdrant_url= None,
        qdrant_api_key= None
    )

    result = qdrant_tool.check_hashed_collection(id)
    if result[0] == []:
        point = PointStruct(
            id =str(uuid.uuid4()),
            vector=[0.0,0.0,0.0,0.0],
            payload={
                "patient_id": id,
                "patient_hash" : hashed_patient_val
            }
        )
        try:
            qdrant_tool.client.upsert(
                collection_name="hashed_patient_data",
                points= [point]
            )
        except Exception as e:
            print(f"error storing point {e}")

        embedder.test_chunking(results, id) 
    else:
        records = result[0]
        previous_hash =  records[0].payload['patient_hash']
        if previous_hash != hashed_patient_val:
            qdrant_tool.delete_points_by_patient_id(id)
            embedder.test_chunking(results, id) 
            qdrant_tool.client.set_payload(
                collection_name = qdrant_tool.hashed_collection_name,
                payload = {
                    "patient_id": id,
                    "patient_hash" : hashed_patient_val
                },
                points = Filter(
                    must=[
                        FieldCondition(
                            key="patient_id",
                            match=MatchValue(value=id)
                        )
                    ]
                )
            )



