import httpx
import jwt
import os
import logging
import asyncio
import pytz
import secrets
from urllib.parse import urlencode
from datetime import datetime, timedelta
from typing import Optional, Dict
from app.models import LoginRequest, LoginResponse, SessionUser
from app.crew.tools.tools import QdrantVectorSearchTool
from app.services.appointment_service import _prewarm_schedule_cache, SCHEDULE_CACHE_WEEKS

logger = logging.getLogger(__name__)

class AuthService:
    def __init__(self):
        self.SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-in-production")
        self.user_sessions: Dict[str, SessionUser] = {}  # In-memory storage
        self.SESSION_DURATION = timedelta(hours=8)  # 8 hour sessions
        # Outlook OAuth config
        self.OUTLOOK_CLIENT_ID = os.getenv("OUTLOOK_CLIENT_ID", "")
        self.OUTLOOK_CLIENT_SECRET = os.getenv("OUTLOOK_CLIENT_SECRET", "")
        self.OUTLOOK_TENANT_ID = os.getenv("OUTLOOK_TENANT_ID", "")
        self.OUTLOOK_REDIRECT_URI = os.getenv("OUTLOOK_REDIRECT_URI", "http://localhost:8080/auth/outlook/callback")
        # Store OAuth state tokens to prevent CSRF
        self._oauth_states: Dict[str, datetime] = {}
    
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

            # Kick off background prewarm of the current 3‑week schedule cache window for this practice.
            try:
                pacific = pytz.timezone("US/Pacific")
                today_pacific = datetime.now(pacific).date()
                weekday = today_pacific.weekday()  # Monday=0
                current_monday = today_pacific - timedelta(days=weekday)
                window_start_dt = current_monday
                window_end_dt = current_monday + timedelta(weeks=SCHEDULE_CACHE_WEEKS) - timedelta(days=1)
                window_start = window_start_dt.strftime("%Y-%m-%d")
                window_end = window_end_dt.strftime("%Y-%m-%d")
                base_url = f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/fhir/v2"

                asyncio.create_task(
                    _prewarm_schedule_cache(
                        base_url,
                        session_user.modmed_access_token,
                        practice_api_key,
                        window_start,
                        window_end,
                        logger,
                    )
                )
            except Exception as e:
                logger.warning(f"[Schedule cache] Failed to start login prewarm for practice {practice_url}: {e}")
            
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
        
        # oauth_url = f"https://stage.ema-api.com/ema-dev/firm/{practice_url}/ema/ws/oauth2/grant"
        oauth_url = f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/ws/oauth2/grant"
        
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
            
            # Check if ModMed token needs refresh (only for ModMed-authenticated users)
            if session_user.modmed_expires_at and datetime.utcnow() > session_user.modmed_expires_at:
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
        
        # oauth_url = f"https://stage.ema-api.com/ema-dev/firm/{session_user.practice_url}/ema/ws/oauth2/grant"
        oauth_url = f"https://mmapi.ema-api.com/ema-prod/firm/{session_user.practice_url}/ema/ws/oauth2/grant"
        
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

    # ── Outlook OAuth ──────────────────────────────────────────────

    def get_outlook_authorize_url(self) -> str:
        """Build the Microsoft OAuth2 authorization URL."""
        state = secrets.token_urlsafe(32)
        self._oauth_states[state] = datetime.utcnow() + timedelta(minutes=10)
        params = {
            "client_id": self.OUTLOOK_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": self.OUTLOOK_REDIRECT_URI,
            "response_mode": "query",
            "scope": "openid profile email User.Read",
            "state": state,
        }
        base = f"https://login.microsoftonline.com/{self.OUTLOOK_TENANT_ID}/oauth2/v2.0/authorize"
        return f"{base}?{urlencode(params)}"

    def _validate_oauth_state(self, state: str) -> bool:
        """Validate and consume an OAuth state token."""
        expiry = self._oauth_states.pop(state, None)
        if expiry is None:
            return False
        if datetime.utcnow() > expiry:
            return False
        return True

    def _get_authorized_outlook_config(self, email: str) -> Optional[tuple]:
        """
        Check if an email is authorized and return its practice mapping.
        Reads OUTLOOK_AUTHORIZED_EMAILS env var.
        Format: "email1@org.com:practice_name,email2@org.com:practice_name"
        Returns (practice_name,) or None if not authorized.
        """
        authorized = os.getenv("OUTLOOK_AUTHORIZED_EMAILS", "")
        for entry in authorized.split(","):
            entry = entry.strip()
            if ":" in entry:
                allowed_email, practice_name = entry.rsplit(":", 1)
                if allowed_email.strip().lower() == email.lower():
                    return (practice_name.strip(),)
        return None

    def _get_practice_modmed_credentials(self, practice_name: str) -> Optional[tuple]:
        """
        Look up a practice's ModMed FHIR credentials from PRACTICE_* env vars.
        Returns (username, practice_url, api_key) or None.
        """
        env_key = f"PRACTICE_{practice_name}"
        value = os.getenv(env_key)
        if not value:
            return None
        parts = value.split(",")
        if len(parts) == 3:
            return parts[0].strip(), parts[1].strip(), parts[2].strip()
        return None

    async def authenticate_outlook_user(self, code: str, state: str) -> Optional[LoginResponse]:
        """
        Complete the Outlook OAuth flow:
        1. Validate state
        2. Exchange code for tokens
        3. Get user profile (email)
        4. Check authorization
        5. Optionally get ModMed tokens for the mapped practice
        6. Create session
        """
        # Validate state
        if not self._validate_oauth_state(state):
            logger.warning("Invalid or expired OAuth state")
            return LoginResponse(
                success=False, session_token="", username="", practice_url="",
                expires_at=datetime.utcnow(), message="Invalid OAuth state. Please try again."
            )

        # Exchange code for Microsoft tokens
        token_url = f"https://login.microsoftonline.com/{self.OUTLOOK_TENANT_ID}/oauth2/v2.0/token"
        token_data = {
            "client_id": self.OUTLOOK_CLIENT_ID,
            "client_secret": self.OUTLOOK_CLIENT_SECRET,
            "code": code,
            "redirect_uri": self.OUTLOOK_REDIRECT_URI,
            "grant_type": "authorization_code",
            "scope": "openid profile email User.Read",
        }
        try:
            timeout = httpx.Timeout(30.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as http_client:
                resp = await http_client.post(token_url, data=token_data)
                if resp.status_code != 200:
                    logger.error(f"Microsoft token exchange failed: {resp.status_code} {resp.text[:300]}")
                    return LoginResponse(
                        success=False, session_token="", username="", practice_url="",
                        expires_at=datetime.utcnow(), message="Microsoft authentication failed."
                    )
                ms_tokens = resp.json()

                # Get user profile from Microsoft Graph
                graph_resp = await http_client.get(
                    "https://graph.microsoft.com/v1.0/me",
                    headers={"Authorization": f"Bearer {ms_tokens['access_token']}"},
                )
                if graph_resp.status_code != 200:
                    logger.error(f"Microsoft Graph /me failed: {graph_resp.status_code}")
                    return LoginResponse(
                        success=False, session_token="", username="", practice_url="",
                        expires_at=datetime.utcnow(), message="Failed to retrieve Microsoft profile."
                    )
                profile = graph_resp.json()
        except Exception as e:
            logger.exception("Outlook OAuth exchange failed")
            return LoginResponse(
                success=False, session_token="", username="", practice_url="",
                expires_at=datetime.utcnow(), message="Authentication system error."
            )

        email = (profile.get("mail") or profile.get("userPrincipalName") or "").strip()
        display_name = profile.get("displayName", email)
        if not email:
            return LoginResponse(
                success=False, session_token="", username="", practice_url="",
                expires_at=datetime.utcnow(), message="No email found on Microsoft account."
            )

        # Check authorization
        outlook_config = self._get_authorized_outlook_config(email)
        if not outlook_config:
            logger.warning(f"Unauthorized Outlook email attempted login: {email}")
            return LoginResponse(
                success=False, session_token="", username="", practice_url="",
                expires_at=datetime.utcnow(), message=f"Email '{email}' is not authorized to access UroAssist."
            )

        practice_name = outlook_config[0]

        # Look up practice's ModMed FHIR credentials
        modmed_creds = self._get_practice_modmed_credentials(practice_name)
        modmed_access_token = None
        modmed_refresh_token = None
        modmed_expires_at = None
        practice_api_key = None
        practice_url = practice_name
        fhir_username = None

        if modmed_creds:
            fhir_username, practice_url, practice_api_key = modmed_creds
            # Auto-authenticate with ModMed using stored FHIR password
            fhir_password = os.getenv(f"PRACTICE_FHIR_PASSWORD_{practice_name}", "")
            if fhir_password:
                mm_tokens = await self._authenticate_with_modmed(
                    fhir_username, fhir_password, practice_url, practice_api_key
                )
                if mm_tokens:
                    modmed_access_token = mm_tokens["access_token"]
                    modmed_refresh_token = mm_tokens["refresh_token"]
                    modmed_expires_at = datetime.utcnow() + timedelta(hours=2)
                    logger.info(f"Auto-authenticated with ModMed for Outlook user {email}")
                else:
                    logger.warning(f"ModMed auto-auth failed for practice {practice_name}")

        # Generate session token
        expires_at = datetime.utcnow() + self.SESSION_DURATION
        session_payload = {
            "username": email,
            "practice_url": practice_url,
            "auth_method": "outlook",
            "exp": expires_at,
            "iat": datetime.utcnow(),
        }
        session_token = jwt.encode(session_payload, self.SECRET_KEY, algorithm="HS256")

        # Create qdrant tool for this practice
        user_qdrant_tool = None
        try:
            user_qdrant_tool = QdrantVectorSearchTool(
                collection_name=practice_url,
                limit=5,
                qdrant_url=os.getenv("QDRANT_URL"),
                qdrant_api_key=os.getenv("QDRANT_API_KEY"),
            )
        except Exception as e:
            logger.warning(f"Failed to create Qdrant tool for Outlook user: {e}")

        session_user = SessionUser(
            username=email,
            practice_url=practice_url,
            session_token=session_token,
            auth_method="outlook",
            modmed_access_token=modmed_access_token,
            modmed_refresh_token=modmed_refresh_token,
            modmed_expires_at=modmed_expires_at,
            created_at=datetime.utcnow(),
            expires_at=expires_at,
            practice_api_key=practice_api_key,
            qdrant_tool=user_qdrant_tool,
        )
        self.user_sessions[session_token] = session_user

        logger.info(f"Outlook user authenticated: {email} → practice {practice_url}")

        # Prewarm schedule cache if we have ModMed tokens
        if modmed_access_token and practice_api_key:
            try:
                pacific = pytz.timezone("US/Pacific")
                today_pacific = datetime.now(pacific).date()
                weekday = today_pacific.weekday()
                current_monday = today_pacific - timedelta(days=weekday)
                window_start = current_monday.strftime("%Y-%m-%d")
                window_end = (current_monday + timedelta(weeks=SCHEDULE_CACHE_WEEKS) - timedelta(days=1)).strftime("%Y-%m-%d")
                base_url = f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/fhir/v2"
                asyncio.create_task(
                    _prewarm_schedule_cache(base_url, modmed_access_token, practice_api_key, window_start, window_end, logger)
                )
            except Exception as e:
                logger.warning(f"[Schedule cache] prewarm failed for Outlook user: {e}")

        return LoginResponse(
            success=True,
            session_token=session_token,
            username=email,
            practice_url=practice_url,
            expires_at=expires_at,
            message="Login successful",
        )


# Global auth service instance
auth_service = AuthService()
