import httpx
import jwt
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict
from app.models import LoginRequest, LoginResponse, SessionUser
from app.crew.tools.tools import QdrantVectorSearchTool

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        self.user_sessions: Dict[str, SessionUser] = {}  # In-memory storage
        self.SESSION_DURATION = timedelta(hours=8)  # 8 hour sessions
    
    async def authenticate_user(self, login_data: LoginRequest) -> Optional[LoginResponse]:
        """
        Authenticate user with ModMed credentials and create session
        """
        try:
            # Get practice configuration by username
            practice_config = self._get_practice_config(login_data.username)
            if not practice_config:
                return LoginResponse(
                    success=False,
                    session_token="",
                    username="",
                    practice_url="",
                    expires_at=datetime.utcnow(),
                    message=f"Username '{login_data.username}' is not configured for any practice"
                )
            
            practice_url, practice_api_key = practice_config
            
            # Call ModMed OAuth API with user's credentials
            modmed_tokens = await self._authenticate_with_modmed(
                login_data.username, 
                login_data.password, 
                practice_url,
                practice_api_key
            )
            
            if not modmed_tokens:
                logger.warning("ModMed authentication failed", 
                             extra={"username": login_data.username, "practice_url": practice_url})
                return LoginResponse(
                    success=False,
                    session_token="",
                    username="",
                    practice_url="",
                    expires_at=datetime.utcnow(),
                    message="Invalid ModMed credentials"
                )
            
            # Generate session token
            expires_at = datetime.utcnow() + self.SESSION_DURATION
            session_payload = {
                "username": login_data.username,
                "practice_url": practice_url,
                "exp": expires_at,
                "iat": datetime.utcnow()
            }
            
            session_token = jwt.encode(session_payload, self.SECRET_KEY, algorithm="HS256")
            
            # Create practice-specific qdrant tool for this user
            user_qdrant_tool = QdrantVectorSearchTool(
                collection_name=practice_url,
                limit=5,
                qdrant_url=os.getenv("QDRANT_URL"),
                qdrant_api_key=os.getenv("QDRANT_API_KEY")
            )
            
            # Store session data
            session_user = SessionUser(
                username=login_data.username,
                practice_url=practice_url,
                session_token=session_token,
                modmed_access_token=modmed_tokens["access_token"],
                modmed_refresh_token=modmed_tokens["refresh_token"],
                modmed_expires_at=datetime.utcnow() + timedelta(hours=2),  # ModMed tokens expire in 2 hours
                created_at=datetime.utcnow(),
                expires_at=expires_at,
                practice_api_key=practice_api_key,
                qdrant_tool=user_qdrant_tool
            )
            
            self.user_sessions[session_token] = session_user
            
            logger.info("User authenticated successfully", 
                       extra={"username": login_data.username, "practice_url": practice_url})
            
            return LoginResponse(
                success=True,
                session_token=session_token,
                username=login_data.username,
                practice_url=practice_url,
                expires_at=expires_at,
                message="Login successful"
            )
            
        except Exception as e:
            logger.exception("Authentication process failed", 
                           extra={"username": login_data.username})
            return LoginResponse(
                success=False,
                session_token="",
                username="",
                practice_url="",
                expires_at=datetime.utcnow(),
                message="Authentication system error"
            )
    
    def _get_practice_config(self, username: str) -> Optional[tuple]:
        """
        Get practice configuration (practice_url, api_key) for username from environment variables
        Returns tuple of (practice_url, api_key) or None if not found
        """
        # Look for PRACTICE_* environment variables
        for key, value in os.environ.items():
            if key.startswith("PRACTICE_"):
                try:
                    parts = value.split(',')
                    if len(parts) == 3:
                        env_username, practice_url, api_key = parts
                        if env_username.strip() == username:
                            return practice_url.strip(), api_key.strip()
                except Exception as e:
                    logger.warning(f"Invalid PRACTICE_ config format for {key}: {e}")
                    continue
        return None
    
    async def _authenticate_with_modmed(self, username: str, password: str, practice_url: str, api_key: str) -> Optional[Dict]:
        """
        Call ModMed OAuth API to get access tokens
        """
        headers = {
            "x-api-key": api_key,
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        data = {
            "grant_type": "password",
            "username": username,
            "password": password
        }
        
        oauth_url = f"https://stage.ema-api.com/ema-dev/firm/{practice_url}/ema/ws/oauth2/grant"
        
        try:
            # Increase timeout for ModMed API calls
            timeout = httpx.Timeout(30.0, connect=10.0)  # 30s total, 10s connect
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(oauth_url, headers=headers, data=data)
                
                if response.status_code == 200:
                    logger.info("ModMed authentication successful", 
                              extra={"username": username, "practice_url": practice_url})
                    return response.json()
                elif response.status_code == 503:
                    logger.error("ModMed API is temporarily unavailable (503)", 
                               extra={"username": username, "practice_url": practice_url})
                    return None
                else:
                    logger.warning("ModMed authentication failed", 
                                 extra={"username": username, "practice_url": practice_url, 
                                       "status_code": response.status_code, "response": response.text[:200]})
                    return None
                    
        except httpx.ReadTimeout as e:
            logger.error("ModMed API timeout - server took too long to respond", 
                        extra={"username": username, "practice_url": practice_url, "timeout": "30s"})
            return None
        except httpx.ConnectTimeout as e:
            logger.error("ModMed API connection timeout - unable to connect", 
                        extra={"username": username, "practice_url": practice_url, "timeout": "10s"})
            return None
        except Exception as e:
            logger.exception("ModMed API call failed", 
                           extra={"username": username, "practice_url": practice_url, "error_type": type(e).__name__})
            return None
    
    async def validate_session(self, session_token: str) -> Optional[SessionUser]:
        """
        Validate session token and return user info
        """
        try:
            # Decode JWT
            payload = jwt.decode(session_token, self.SECRET_KEY, algorithms=["HS256"])
            
            # Check if session exists
            if session_token not in self.user_sessions:
                return None
            
            session_user = self.user_sessions[session_token]
            
            # Check if session expired
            if datetime.utcnow() > session_user.expires_at:
                del self.user_sessions[session_token]
                return None
            
            # Check if ModMed token needs refresh
            if datetime.utcnow() > session_user.modmed_expires_at:
                await self._refresh_modmed_token(session_token)
            
            return session_user
            
        except jwt.ExpiredSignatureError:
            logger.info("Session token expired", extra={"session_token": session_token[:20]})
            # Remove expired session
            self.user_sessions.pop(session_token, None)
            return None
        except jwt.InvalidTokenError:
            logger.warning("Invalid session token", extra={"session_token": session_token[:20]})
            return None
    
    async def _refresh_modmed_token(self, session_token: str):
        """
        Refresh ModMed access token using refresh token
        """
        if session_token not in self.user_sessions:
            return
        
        session_user = self.user_sessions[session_token]
        
        headers = {
            "x-api-key": session_user.practice_api_key,
            "Content-Type": "application/x-www-form-urlencoded"
        }
        
        data = {
            "grant_type": "refresh_token",
            "refresh_token": session_user.modmed_refresh_token
        }
        
        oauth_url = f"https://stage.ema-api.com/ema-dev/firm/{session_user.practice_url}/ema/ws/oauth2/grant"
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(oauth_url, headers=headers, data=data)
                
                if response.status_code == 200:
                    tokens = response.json()
                    # Update stored tokens
                    session_user.modmed_access_token = tokens["access_token"]
                    session_user.modmed_refresh_token = tokens["refresh_token"]
                    session_user.modmed_expires_at = datetime.utcnow() + timedelta(hours=2)
                    logger.info("ModMed token refreshed successfully", 
                              extra={"username": session_user.username, "practice_url": session_user.practice_url})
                else:
                    logger.error("Failed to refresh ModMed token", 
                               extra={"username": session_user.username, "practice_url": session_user.practice_url,
                                     "status_code": response.status_code})
                    
        except Exception as e:
            logger.exception("ModMed token refresh failed", 
                           extra={"username": session_user.username, "practice_url": session_user.practice_url})
    
    async def logout_user(self, session_token: str) -> bool:
        """
        Logout user by removing session
        """
        if session_token in self.user_sessions:
            del self.user_sessions[session_token]
            return True
        return False
    
    def get_modmed_token_for_session(self, session_token: str) -> Optional[str]:
        """
        Get ModMed access token for a session
        """
        if session_token in self.user_sessions:
            return self.user_sessions[session_token].modmed_access_token
        return None

# Global auth service instance
auth_service = AuthService()
