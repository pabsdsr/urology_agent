from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import warnings
import logging
from app.services.client_service import client
from app.crew.crew import ClinicalAssistantCrew
from app.routes import run_crew
from app.routes import all_patients
from app.routes import auth

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.FileHandler('app.log')  # File output
    ]
)

# Create logger instance
logger = logging.getLogger(__name__)

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

    app.include_router(auth.router)
    app.include_router(run_crew.router)
    app.include_router(all_patients.router)

    @app.get("/")
    def read_root():
        return {"Hello": "World"}

    return app

def run(query: str, id: str, practice_url: str = None, user_qdrant_tool = None):
    inputs = {"query": query, "id": id, "practice_url": practice_url}

    try:
        # Create clinical assistant crew instance
        crew_instance = ClinicalAssistantCrew()
        
        # Set user's qdrant tool if provided
        if user_qdrant_tool:
            crew_instance.user_qdrant_tool = user_qdrant_tool
        
        # Get the crew and execute
        crew = crew_instance.crew()
        
        # Update agent tools after crew creation
        if user_qdrant_tool:
            for agent in crew.agents:
                if hasattr(agent, 'tools'):
                    agent.tools = [user_qdrant_tool]
        
        result = crew.kickoff(inputs=inputs)
    except Exception as e:
        raise Exception(f"An error occurred while running the crew: {e}")

    result_dict = result.model_dump()

    token_usage = result_dict.get("token_usage", {})

    tasks_output = result_dict.get("tasks_output", [])
    for task in tasks_output:
        if task.get("agent", "").strip() == "Clinical Assistant Specialist":
            final_answer = task.get("raw", "No final answer found.")
            logger.info(f"Final answer: {final_answer}")
            return final_answer


    return "No relevant output found from Clinical Assistant Specialist."

    
def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()
    