from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Any

class SessionUser(BaseModel):
    model_config = {"arbitrary_types_allowed": True}

    username: str
    practice_url: str
    auth_method: str = "entra"  # "entra" (MSAL access token + cached ModMed)
    # Sign-in email derived from Microsoft Entra token claims.
    email: Optional[str] = None
    is_admin: bool = False
    modmed_access_token: Optional[str] = None
    modmed_refresh_token: Optional[str] = None
    modmed_expires_at: Optional[datetime] = None
    created_at: datetime
    expires_at: datetime
    practice_api_key: Optional[str] = None
    qdrant_tool: Any = None  # QdrantVectorSearchTool instance for this user's practice
