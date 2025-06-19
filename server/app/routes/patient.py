from fastapi import APIRouter
from pydantic import BaseModel
from app.services.patient_info_service import get_patient_info


router = APIRouter(
    prefix = "/patientInfo",
    tags = ["PatientInfo"]
)

class PatientRequest(BaseModel):
    patient_id: str


@router.post("")
async def update_patient_info(req: PatientRequest):
    await get_patient_info(req.patient_id)

    return {"message" : f"Information updated for patient {req.patient_id}"}