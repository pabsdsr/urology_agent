from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import warnings
from app.crew.crew import Ai
from app.routes import run_crew

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

    # Extract output from llm agent
    result = result.model_dump()
    tasks_output = result.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "LLM Expert":
            return task.get("raw", "No final answer found.")

    return "No relevant output found from LLM Expert."

    
def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()
    