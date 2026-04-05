import asyncio
import logging
import os
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

import httpx
import pytz
from app.crew.tools.tools import QdrantVectorSearchTool
from app.models import SessionUser
from app.services.appointment_service import SCHEDULE_CACHE_WEEKS, _prewarm_schedule_cache
from app.services.entra_jwt import EntraAccessTokenError, EntraAccessTokenValidator

logger = logging.getLogger(__name__)


def _email_from_claims(claims: Dict[str, Any]) -> Optional[str]:
    for key in ("email", "preferred_username", "upn"):
        v = claims.get(key)
        if isinstance(v, str) and "@" in v:
            return v.strip().lower()
    return None


def _roles_from_claims(claims: Dict[str, Any]) -> list:
    r = claims.get("roles")
    if isinstance(r, list):
        return list(r)
    if isinstance(r, str) and r:
        return [r]
    return []


def _client_jwt_audiences(client_id: str) -> list[str]:
    """JWT `aud` values we accept: SPA client id and default api:// URI."""
    cid = client_id.strip()
    return [cid, f"api://{cid}"]


def _tenant_id() -> str:
    return (os.getenv("ENTRA_TENANT_ID") or "").strip()


def _client_id() -> str:
    return (os.getenv("ENTRA_CLIENT_ID") or "").strip()


def _admin_role() -> str:
    return (os.getenv("ENTRA_ADMIN_APP_ROLE") or "admin").strip()


class AuthService:
    """
    Resolves API users from Microsoft Entra access tokens and caches ModMed/Qdrant
    state per Entra object id (oid).
    """

    def __init__(self):
        self._cache_lock = asyncio.Lock()
        self._users_by_oid: Dict[str, SessionUser] = {}
        tenant = _tenant_id()
        client_id = _client_id()
        audiences = _client_jwt_audiences(client_id) if client_id else []
        self._entra: Optional[EntraAccessTokenValidator] = None
        if tenant and audiences:
            try:
                self._entra = EntraAccessTokenValidator(tenant, audiences)
            except ValueError as e:
                logger.error("Entra validator not configured: %s", e)
        else:
            logger.warning(
                "Entra auth not fully configured: set ENTRA_TENANT_ID and ENTRA_CLIENT_ID"
            )

    def clear_cache_for_oid(self, oid: str) -> None:
        self._users_by_oid.pop(oid, None)

    async def resolve_session_user_from_access_token(
        self, access_token: str,
    ) -> Optional[SessionUser]:
        if not self._entra:
            return None
        try:
            claims = self._entra.validate(access_token)
        except EntraAccessTokenError:
            return None

        oid = (claims.get("oid") or claims.get("sub") or "").strip()
        if not oid:
            logger.warning("Entra token missing oid/sub")
            return None

        email = _email_from_claims(claims)
        if not email:
            logger.warning(
                "Entra token missing email-style claim (email, preferred_username, upn)"
            )
            return None

        roles = _roles_from_claims(claims)
        token_is_admin = _admin_role() in roles

        async with self._cache_lock:
            cached = self._users_by_oid.get(oid)

        if cached:
            cached.is_admin = token_is_admin
            cached.username = email
            cached.outlook_email = email
            if (
                cached.modmed_expires_at
                and datetime.utcnow() > cached.modmed_expires_at
                and cached.modmed_refresh_token
                and cached.practice_api_key
            ):
                await self._refresh_modmed_token_user(cached)
            return cached

        outlook_config = self._get_authorized_outlook_config(email)
        if not outlook_config:
            logger.warning("Unauthorized email for UroAssist API: %s", email)
            return None

        practice_name = outlook_config[0]
        modmed_creds = self._get_practice_modmed_credentials(practice_name)
        modmed_access_token = None
        modmed_refresh_token = None
        modmed_expires_at = None
        practice_api_key = None
        practice_url = practice_name
        qdrant_tool = None

        if modmed_creds:
            fhir_username, fhir_password, practice_url, practice_api_key = modmed_creds
            mm_tokens = await self._authenticate_with_modmed(
                fhir_username, fhir_password, practice_url, practice_api_key
            )
            if mm_tokens:
                modmed_access_token = mm_tokens["access_token"]
                modmed_refresh_token = mm_tokens["refresh_token"]
                modmed_expires_at = datetime.utcnow() + timedelta(hours=2)
            else:
                logger.warning("ModMed bootstrap failed for practice %s", practice_name)

        try:
            qdrant_tool = QdrantVectorSearchTool(
                collection_name=practice_url,
                limit=5,
                qdrant_url=os.getenv("QDRANT_URL"),
                qdrant_api_key=os.getenv("QDRANT_API_KEY"),
            )
        except Exception as e:
            logger.warning("Failed to create Qdrant tool: %s", e)

        session_user = SessionUser(
            username=email,
            practice_url=practice_url,
            session_token="",
            auth_method="entra",
            outlook_email=email,
            is_admin=token_is_admin,
            modmed_access_token=modmed_access_token,
            modmed_refresh_token=modmed_refresh_token,
            modmed_expires_at=modmed_expires_at,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=3650),
            practice_api_key=practice_api_key,
            qdrant_tool=qdrant_tool,
        )

        async with self._cache_lock:
            if oid in self._users_by_oid:
                existing = self._users_by_oid[oid]
                existing.is_admin = token_is_admin
                existing.username = email
                existing.outlook_email = email
                return existing
            self._users_by_oid[oid] = session_user

        if modmed_access_token and practice_api_key:
            self._start_schedule_prewarm(
                practice_url, modmed_access_token, practice_api_key
            )

        return session_user

    def _start_schedule_prewarm(
        self, practice_url: str, modmed_token: str, practice_api_key: str
    ) -> None:
        try:
            pacific = pytz.timezone("US/Pacific")
            today_pacific = datetime.now(pacific).date()
            weekday = today_pacific.weekday()
            current_monday = today_pacific - timedelta(days=weekday)
            window_start = current_monday.strftime("%Y-%m-%d")
            window_end = (
                current_monday + timedelta(weeks=SCHEDULE_CACHE_WEEKS) - timedelta(days=1)
            ).strftime("%Y-%m-%d")
            base_url = (
                f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/fhir/v2"
            )
            asyncio.create_task(
                _prewarm_schedule_cache(
                    base_url,
                    modmed_token,
                    practice_api_key,
                    window_start,
                    window_end,
                    logger,
                )
            )
        except Exception as e:
            logger.warning("[Schedule cache] login prewarm failed: %s", e)

    async def _refresh_modmed_token_user(self, session_user: SessionUser) -> None:
        if (
            not session_user.practice_api_key
            or not session_user.modmed_refresh_token
            or not session_user.practice_url
        ):
            return
        headers = {
            "x-api-key": session_user.practice_api_key,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "refresh_token",
            "refresh_token": session_user.modmed_refresh_token,
        }
        oauth_url = (
            f"https://mmapi.ema-api.com/ema-prod/firm/{session_user.practice_url}"
            "/ema/ws/oauth2/grant"
        )
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(oauth_url, headers=headers, data=data)
                if response.status_code == 200:
                    tokens = response.json()
                    session_user.modmed_access_token = tokens["access_token"]
                    session_user.modmed_refresh_token = tokens["refresh_token"]
                    session_user.modmed_expires_at = datetime.utcnow() + timedelta(
                        hours=2
                    )
                    logger.info(
                        "ModMed token refreshed for %s",
                        session_user.outlook_email or session_user.username,
                    )
                else:
                    logger.error(
                        "Failed to refresh ModMed token: status %s",
                        response.status_code,
                    )
        except Exception:
            logger.exception("ModMed token refresh failed")

    async def _authenticate_with_modmed(
        self, username: str, password: str, practice_url: str, api_key: str
    ) -> Optional[Dict]:
        headers = {
            "x-api-key": api_key,
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = {
            "grant_type": "password",
            "username": username,
            "password": password,
        }
        oauth_url = (
            f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/ws/oauth2/grant"
        )
        try:
            timeout = httpx.Timeout(30.0, connect=10.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(oauth_url, headers=headers, data=data)
                if response.status_code == 200:
                    logger.info(
                        "ModMed authentication successful",
                        extra={"username": username, "practice_url": practice_url},
                    )
                    return response.json()
                logger.warning(
                    "ModMed authentication failed",
                    extra={
                        "username": username,
                        "practice_url": practice_url,
                        "status_code": response.status_code,
                        "response": response.text[:200],
                    },
                )
                return None
        except httpx.ReadTimeout:
            logger.error(
                "ModMed API read timeout",
                extra={"username": username, "practice_url": practice_url},
            )
            return None
        except httpx.ConnectTimeout:
            logger.error(
                "ModMed API connect timeout",
                extra={"username": username, "practice_url": practice_url},
            )
            return None
        except Exception:
            logger.exception(
                "ModMed API call failed",
                extra={"username": username, "practice_url": practice_url},
            )
            return None

    def _get_authorized_outlook_config(self, email: str) -> Optional[tuple]:
        """
        Check if an email is authorized and return its practice mapping.
        Reads AUTHORIZED_EMAILS env var.
        Format: "user@org.com:practice_name,@domain.com:practice_name"
        """
        authorized = os.getenv("AUTHORIZED_EMAILS", "")
        email_lower = email.lower().strip()
        for entry in authorized.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            pattern, practice_name = entry.rsplit(":", 1)
            pattern = pattern.strip().lower()
            practice_name = practice_name.strip()
            if pattern.startswith("@"):
                if email_lower.endswith(pattern):
                    return (practice_name,)
            else:
                if email_lower == pattern:
                    return (practice_name,)
        return None

    def _get_practice_modmed_credentials(self, practice_name: str) -> Optional[tuple]:
        """
        Look up a practice's ModMed FHIR credentials from PRACTICE_* env vars.

        Expected env format:
            PRACTICE_<practice_name>=username,password,api_key
        """
        env_key = f"PRACTICE_{practice_name}"
        value = os.getenv(env_key)
        if not value:
            return None
        parts = value.split(",")
        if len(parts) == 3:
            username = parts[0].strip()
            password = parts[1].strip()
            api_key = parts[2].strip()
            practice_url = practice_name.strip()
            return username, password, practice_url, api_key
        return None

    def try_clear_cache_for_access_token(self, access_token: str) -> None:
        """Best-effort: drop cached ModMed state after logout (token may be expired)."""
        if not self._entra:
            return
        try:
            claims = self._entra.validate(access_token)
        except EntraAccessTokenError:
            return
        oid = (claims.get("oid") or claims.get("sub") or "").strip()
        if oid:
            self.clear_cache_for_oid(oid)


auth_service = AuthService()

