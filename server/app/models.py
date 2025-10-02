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

class SessionUser(BaseModel):
    model_config = {"arbitrary_types_allowed": True}
    
    username: str
    practice_url: str
    session_token: str
    modmed_access_token: str
    modmed_refresh_token: str
    modmed_expires_at: datetime
    created_at: datetime
    expires_at: datetime
    practice_api_key: str
    qdrant_tool: Any  # QdrantVectorSearchTool instance for this user's practice
