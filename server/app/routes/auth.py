from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from app.models import LoginRequest, LoginResponse, SessionUser
from app.services.auth_service import auth_service

router = APIRouter(
    prefix="/auth",
    tags=["authentication"]
)

# Dependency to validate session and get current user (moved to top)
async def get_current_user(authorization: Optional[str] = Header(None)) -> SessionUser:
    """
    FastAPI dependency to validate session and return current user
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401, 
            detail="No valid session token provided",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    session_token = authorization.split(" ")[1]
    user = await auth_service.validate_session(session_token)
    
    if not user:
        raise HTTPException(
            status_code=401, 
            detail="Invalid or expired session",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return user

@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """
    Login with ModMed credentials (username, password, practice URL)
    """
    result = await auth_service.authenticate_user(credentials)
    
    if not result.success:
        raise HTTPException(
            status_code=401, 
            detail=result.message or "Authentication failed"
        )
    
    return result

@router.post("/logout")
async def logout(current_user: SessionUser = Depends(get_current_user)):
    """
    Logout current user session
    """
    success = await auth_service.logout_user(current_user.session_token)
    
    if success:
        return {"message": "Logged out successfully"}
    else:
        raise HTTPException(status_code=400, detail="Logout failed")

@router.get("/me")
async def get_current_user_info(current_user: SessionUser = Depends(get_current_user)):
    """
    Get current user information
    """
    return {
        "username": current_user.username,
        "practice_url": current_user.practice_url,
        "expires_at": current_user.expires_at,
        "created_at": current_user.created_at
    }
