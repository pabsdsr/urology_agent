import httpx
import jwt
from datetime import datetime, timedelta
import asyncio
import os

headers = {
    "x-api-key" : os.environ.get("modmed_api_key"),
    "Content-Type" : "application/x-www-form-urlencoded"
}


data = {
    "grant_type" : "password",
    "username" : os.environ.get("modmed_username"),
    "password" : os.environ.get("modmed_password")
}


class TokenService:
    def __init__(self):
        self.access_token = None
        self.refresh_token = None
        self.expires_at = None
        self._lock = asyncio.Lock()

    async def get_token(self):
        async with self._lock:
            if(self.access_token and self.expires_at and datetime.now() < self.expires_at - timedelta(minutes=5)):
                return self.access_token
            
            if self.refresh_token:
                await self._refresh_token()
            else:
                await self._authenticate()
            
            return self.access_token
        
    async def _refresh_token(self):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/ws/oauth2/grant",
                headers=headers,
                data = {
                    "grant_type" : "refresh_token",
                    "refresh_token" : self.refresh_token
                }
            )

            if response.status_code != 200:
                await self._authenticate()
                return
            
            response_data = response.json()
            self._update_tokens(response_data)


    async def _authenticate(self):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/ws/oauth2/grant",
                headers=headers,
                data=data
            )

            if response.status_code != 200:
                raise Exception(f"Authentication Failed: {response.text}")
            
            auth_data = response.json()
            self._update_tokens(auth_data)

    def _update_tokens(self, auth_data):
        self.access_token = auth_data["access_token"]
        self.refresh_token = auth_data["refresh_token"]
        self.expires_at = self._get_toke_expiration(self.access_token)

    def _get_toke_expiration(self, access_token):
        try:
            decoded_token = jwt.decode(access_token, options={"verify_signature": False})
            print(f"this is the decoded token: {decoded_token}")
            expiration_time = decoded_token.get("exp")
            print(f"this is the expiration time: {expiration_time}")

            if expiration_time:
                return datetime.fromtimestamp(expiration_time)
        except Exception:
            pass

token_service = TokenService()
