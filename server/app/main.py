from contextlib import asynccontextmanager
from dotenv import load_dotenv
load_dotenv()  # Load .env before anything else reads env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import warnings
import logging
import os
from app.services.client_service import client
from app.routes import auth, run_crew, patients, appointments, call_schedule, billing

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('app.log')
    ]
)
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await client.aclose()


def create_app():
    """Build FastAPI app with CORS and route modules."""
    app = FastAPI(
        title="UroAssist Backend",
        lifespan=lifespan,
    )

    # CORS allowlist (TLS is enforced at the load balancer / reverse proxy in production).
    allowed_origins = []

    if os.getenv('ENVIRONMENT') == 'production':
        allowed_origins = [
            "https://www.uroassist.net",
            "https://uroassist.net",
            "https://api.uroassist.net",
        ]
    else:
        allowed_origins = [
            "http://localhost:5173",
        ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(run_crew.router)
    app.include_router(patients.router)
    app.include_router(appointments.router)
    app.include_router(call_schedule.router)
    app.include_router(billing.router)

    @app.get("/")
    def read_root():
        return {"Hello": "World"}
    
    @app.get("/health")
    def health_check():
        """Health check endpoint for AWS load balancer"""
        return {"status": "healthy", "service": "UroAssist-backend"}

    return app


def main():
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
