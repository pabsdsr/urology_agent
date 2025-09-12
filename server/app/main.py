from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import warnings
from app.services.client_service import client
from app.crew.crew import Ai
from app.routes import run_crew
from app.routes import all_patients
from app.services import patient_info_service

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")



@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code (if any) runs here before server starts handling requests
    yield
    # Shutdown code runs here after server stops handling requests
    await client.aclose()

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
    app.include_router(patient_info_service.router)

    @app.get("/")
    def read_root():
        return {"Hello": "World"}

    return app

def run(query: str, id: str):
    inputs = {"query": query, "id": id}

    try:
        result = Ai().crew().kickoff(inputs=inputs)
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")

    result_dict = result.model_dump()

    token_usage = result_dict.get("token_usage", {})
    print(token_usage)

    tasks_output = result_dict.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "RAG Specialist":
            final_answer = task.get("raw", "No final answer found.")
            print(final_answer)
            return final_answer


    return "No relevant output found from LLM Expert."

    
def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()
    