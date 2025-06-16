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

@router.post("")
async def run_crew(input_data: CrewInput):
    id = input_data.id
    query = input_data.query

    await get_patient_info(id)

    from app.main import run

    try:
        result = run(query=query, id=id)
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}