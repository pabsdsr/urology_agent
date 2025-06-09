from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from app.routes import hello, all_patients, run_crew
import uvicorn
import os
import sys
from pydantic import BaseModel

# Build paths relative to this file's location
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.normpath(os.path.join(current_dir, "../../ai/.env"))
ai_src_path = os.path.normpath(os.path.join(current_dir, "../../ai/src"))

load_dotenv(env_path)
sys.path.append(ai_src_path)


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

    app.include_router(hello.router)
    app.include_router(all_patients.router)
    app.include_router(run_crew.router)

    return app

def main():
    app = create_app()
    # we will have to adjust the port later in our production version
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()