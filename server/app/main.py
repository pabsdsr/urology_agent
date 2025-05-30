from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
load_dotenv()
from app.routes import hello, id, all_patients
import uvicorn


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
    app.include_router(id.router)
    app.include_router(all_patients.router)

    return app

def main():
    app = create_app()
    # we will have to adjust the port later in our production version
    uvicorn.run(app, host="0.0.0.0", port=8080)

if __name__ == "__main__":
    main()