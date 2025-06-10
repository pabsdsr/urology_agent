from fastapi import APIRouter
from pydantic import BaseModel
from app.services.patient_info_service import get_patient_info


router = APIRouter(
    prefix = "/run_crew",
    tags = ["run_crew"]
)

class CrewInput(BaseModel):
        query: str
        id: str

# input_data: CrewInput
@router.get("")
async def run_crew():
    # input_data.id
    await get_patient_info("296015")


    from app.main import run

    query = "Does this patient have any history of fatigue"
    id = "296015"

    try:
        result = run(query=query, id=id)
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}