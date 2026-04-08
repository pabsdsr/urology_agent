import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import logging
from app.services.patient_info_service import get_patient_info
from app.routes.auth import require_modmed_session
from app.models import SessionUser

logger = logging.getLogger(__name__)


router = APIRouter(
    prefix = "/run_crew",
    tags = ["run_crew"]
)

class CrewInput(BaseModel):
    """Body for clinical assistant run; `id` is the ModMed patient id."""
    query: str = Field(..., description="User question for the assistant")
    id: str = Field(..., description="FHIR Patient id")

@router.post("")
async def run_crew(req: CrewInput, current_user: SessionUser = Depends(require_modmed_session)):

    # Always ensure patient data is embedded before running crew
    await get_patient_info(
        req.id, 
        modmed_token=current_user.modmed_access_token,
        practice_url=current_user.practice_url,
        practice_api_key=current_user.practice_api_key,
        user_qdrant_tool=current_user.qdrant_tool
    )

    from app.main import run

    try:
        logger.info("Starting crew execution", 
                   extra={"patient_id": req.id, "query": req.query[:50], 
                         "username": current_user.username, "practice_url": current_user.practice_url})
        
        # CrewAI is synchronous; run off the event loop so other requests can progress.
        result = await asyncio.to_thread(
            run,
            req.query,
            req.id,
            current_user.practice_url,
            current_user.qdrant_tool,
        )
        
        logger.info("Crew execution completed successfully", 
                   extra={"patient_id": req.id, "username": current_user.username})
        
        return {"result": result}
    except Exception as e:
        logger.exception("Crew execution failed", 
                        extra={"patient_id": req.id, "query": req.query[:50], 
                              "username": current_user.username, "practice_url": current_user.practice_url})
        raise HTTPException(status_code=500, detail="Failed to process query")