from fastapi import APIRouter, HTTPException

router = APIRouter(
    prefix = "/hello",
    tags = ["hello"]
)

@router.get("/")
async def hello_world():
    return "hello world"