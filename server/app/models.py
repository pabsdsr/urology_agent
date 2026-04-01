from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Any

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="ModMed username")
    password: str = Field(..., min_length=1, description="ModMed password")

class LoginResponse(BaseModel):
    success: bool
    session_token: str
    username: str
    practice_url: str
    expires_at: datetime
    message: Optional[str] = None
    is_admin: bool = False

class SessionUser(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    username: str
    practice_url: str
    session_token: str
    auth_method: str = "modmed"  # "modmed" or "outlook"
    # Microsoft sign-in address; set only for Outlook OAuth. ModMed-only sessions use shared service usernames.
    outlook_email: Optional[str] = None
    is_admin: bool = False
    modmed_access_token: Optional[str] = None
    modmed_refresh_token: Optional[str] = None
    modmed_expires_at: Optional[datetime] = None
    created_at: datetime
    expires_at: datetime
    practice_api_key: Optional[str] = None
    qdrant_tool: Any = None  # QdrantVectorSearchTool instance for this user's practice
