"""Synchronous CrewAI execution, isolated from the FastAPI app bootstrap.

Living here (instead of in app.main) lets route modules import `run` directly
without creating an import cycle through the application entrypoint.
"""
from app.crew.crew import ClinicalAssistantCrew

# The crew task whose raw output is the user-facing answer.
_FINAL_ANSWER_AGENT = "Clinical Assistant Specialist"


def run(query: str, patient_id: str, practice_url: str | None = None, user_qdrant_tool=None):
    """
    Execute the CrewAI clinical assistant synchronously.

    This is blocking/CPU-bound, so callers should invoke it via
    ``asyncio.to_thread`` from async request handlers. Exceptions propagate to
    the caller with their original traceback intact.
    """
    inputs = {"query": query, "id": patient_id, "practice_url": practice_url}

    crew_instance = ClinicalAssistantCrew()
    if user_qdrant_tool:
        crew_instance.user_qdrant_tool = user_qdrant_tool

    result = crew_instance.crew().kickoff(inputs=inputs)
    result_dict = result.model_dump()

    for task in result_dict.get("tasks_output", []):
        if task.get("agent", "").strip() == _FINAL_ANSWER_AGENT:
            return task.get("raw", "No final answer found.")

    return f"No relevant output found from {_FINAL_ANSWER_AGENT}."
