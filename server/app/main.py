from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import warnings
from app.crew.crew import Ai
from app.routes import run_crew, all_patients, add_document
# from app.services import patient_info_service

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")


def create_app():
    app = FastAPI(
        title="Urology Agent Backend"
    )

    app.add_middleware(
        CORSMiddleware,
        # we have to adjust this origin to our frontend url once it is hosted
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(run_crew.router)
    app.include_router(all_patients.router)
    app.include_router(add_document.router)
    # app.include_router(patient_info_service.router)

    @app.get("/")
    def read_root():
        return {"Hello": "World"}

    return app

prev_id = None
    
def run(query: str, id: str):
    global prev_id

    inputs = {
        "query": query,
        "id": id,
        "prev_id": prev_id
    }

    try:
        result = Ai().crew().kickoff(inputs=inputs)
        prev_id = id
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")

    result = result.model_dump()
    tasks_output = result.get("tasks_output", [])
    if tasks_output:
        last_task = tasks_output[-1]
        return last_task.get("raw", "No final answer found.")
    else:
        return "No tasks were executed."

    
def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()
    
