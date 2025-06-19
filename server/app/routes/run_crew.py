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
async def run_crew(req: CrewInput):

    from app.main import run

    try:
        result = run(query=req.query, id=req.id)
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}