from fastapi import APIRouter
from pydantic import BaseModel
import os
import sys
import shutil

current_dir = os.path.dirname(os.path.abspath(__file__))
ai_src_path = os.path.normpath(os.path.join(current_dir, "../../../ai/src"))
db_path = os.path.normpath(os.path.join(current_dir, "../../../ai/db"))
sys.path.append(ai_src_path)

router = APIRouter()

class CrewInput(BaseModel):
        query: str
        id: int

# prev_id = None

@router.post("/run_crew")
async def run_crew(input_data: CrewInput):

    # global prev_id

    # if os.path.exists(db_path) and prev_id != input_data.id:
    #     shutil.rmtree(db_path)
    #     print("db deleted")
    # else:
    #     print("db not deleted")

    from ai.main import run

    try:
        result = run(query=input_data.query, id=input_data.id)
        # prev_id = input_data.id
        return {"result": result}
    except Exception as e:
        return {"error": str(e)}