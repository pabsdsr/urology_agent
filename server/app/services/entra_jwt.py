"""
Validate Microsoft Entra ID (Azure AD) access tokens for this API using JWKS.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import jwt
from jwt import PyJWKClient

logger = logging.getLogger(__name__)


class EntraAccessTokenError(Exception):
    """Raised when an access token fails validation."""


class EntraAccessTokenValidator:
    def __init__(self, tenant_id: str, valid_audiences: List[str]):
        if not tenant_id or not tenant_id.strip():
            raise ValueError("ENTRA_TENANT_ID (or OUTLOOK_TENANT_ID) is required")
        self.tenant_id = tenant_id.strip()
        if not valid_audiences:
            raise ValueError("At least one expected audience is required")
        self._audiences = list(valid_audiences)
        self._issuer = f"https://login.microsoftonline.com/{self.tenant_id}/v2.0"
        jwks_url = (
            f"https://login.microsoftonline.com/{self.tenant_id}/discovery/v2.0/keys"
        )
        self._jwks = PyJWKClient(
            jwks_url,
            cache_keys=True,
            max_cached_keys=16,
        )

    def validate(self, token: str) -> Dict[str, Any]:
        try:
            signing_key = self._jwks.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=self._audiences,
                issuer=self._issuer,
                options={
                    "verify_aud": True,
                    "verify_iss": True,
                    "require": ["exp", "iat"],
                },
                leeway=120,
            )
            return payload
        except jwt.PyJWTError as e:
            logger.info("Entra JWT validation failed: %s", e)
            raise EntraAccessTokenError(str(e)) from e
