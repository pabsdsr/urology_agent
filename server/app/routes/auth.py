from fastapi import APIRouter, Depends, Header, HTTPException
from typing import Optional

from app.models import SessionUser
from app.services.auth_service import auth_service

router = APIRouter(
    prefix="/auth",
    tags=["authentication"],
)


async def get_current_user(
    authorization: Optional[str] = Header(None),
) -> SessionUser:
    """Resolve authenticated user from Bearer access token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="No access token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = authorization[7:].strip()
    if not access_token:
        raise HTTPException(
            status_code=401,
            detail="No access token provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await auth_service.resolve_session_user_from_access_token(access_token)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid or unauthorized access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def require_admin(
    current_user: SessionUser = Depends(get_current_user),
) -> SessionUser:
    """Require admin role for protected routes."""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


async def require_modmed_session(
    current_user: SessionUser = Depends(get_current_user),
) -> SessionUser:
    """
    Require a usable ModMed token and practice API key (schedule, patients, crew).
    """
    if not current_user.modmed_access_token or not current_user.practice_api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "ModMed session is not available for this account. "
                "Practice credentials may be missing or ModMed login failed."
            ),
        )
    return current_user


@router.post("/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """
    Clears server-side ModMed/Qdrant cache for this Entra user.
    The client should also sign out with MSAL.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token:
            auth_service.try_clear_cache_for_access_token(token)
    return {"message": "Logged out successfully"}


@router.get("/me")
async def get_current_user_info(current_user: SessionUser = Depends(get_current_user)):
    """Return profile fields used by the frontend session context."""
    return {
        "username": current_user.username,
        "email": current_user.email,
        "practice_url": current_user.practice_url,
        "expires_at": current_user.expires_at,
        "created_at": current_user.created_at,
        "auth_method": current_user.auth_method,
        "is_admin": current_user.is_admin,
    }
