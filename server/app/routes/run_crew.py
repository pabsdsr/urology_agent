from fastapi import APIRouter
from pydantic import BaseModel
import os
import sys
from app.services.patient_info_service import get_patient_info

current_dir = os.path.dirname(os.path.abspath(__file__))
ai_src_path = os.path.normpath(os.path.join(current_dir, "../../../ai/src"))
db_path = os.path.normpath(os.path.join(current_dir, "../../../ai/db"))
sys.path.append(ai_src_path)

router = APIRouter(
    prefix = "/run_crew",
    tags = ["run_crew"]
)

class CrewInput(BaseModel):
        query: str
        id: str

@router.post("")
async def run_crew(input_data: CrewInput):
    await get_patient_info(input_data.id)

    from ai.main import run

    try:
        result = run(query=input_data.query, id=input_data.id)
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}