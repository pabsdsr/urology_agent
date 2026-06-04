import base64
import logging
import os
from urllib.parse import quote

import httpx

from app.services.client_service import client as http_client

logger = logging.getLogger(__name__)

GRAPH_SCOPE = "https://graph.microsoft.com/.default"
TOKEN_URL = "https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
SEND_MAIL_URL = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"


class GraphMailError(Exception):
    """Raised when Microsoft Graph mail send fails."""


def _env(primary: str, fallback: str | None = None) -> str:
    value = (os.getenv(primary) or "").strip()
    if not value and fallback:
        value = (os.getenv(fallback) or "").strip()
    if not value:
        names = primary if not fallback else f"{primary} or {fallback}"
        raise GraphMailError(f"Server misconfiguration: missing {names}")
    return value


async def _get_access_token(client: httpx.AsyncClient) -> str:
    tenant_id = _env("GRAPH_TENANT_ID", "ENTRA_TENANT_ID")
    client_id = _env("GRAPH_CLIENT_ID", "ENTRA_CLIENT_ID")
    client_secret = _env("GRAPH_CLIENT_SECRET", "ENTRA_CLIENT_SECRET")

    response = await client.post(
        TOKEN_URL.format(tenant_id=tenant_id),
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": GRAPH_SCOPE,
            "grant_type": "client_credentials",
        },
    )
    if response.status_code != 200:
        logger.error("graph_token_failed status=%s", response.status_code)
        raise GraphMailError("Failed to obtain Microsoft Graph access token.")

    token = response.json().get("access_token")
    if not token:
        raise GraphMailError("Microsoft Graph token response did not include access_token.")
    return token


async def send_billing_email_via_graph(
    *,
    subject: str,
    body_text: str,
    recipient: str,
    reply_to: str | None,
    attachment_filename: str,
    attachment_content_type: str,
    attachment_bytes: bytes,
    client: httpx.AsyncClient | None = None,
) -> None:
    sender_user = _env("GRAPH_SENDER_USER")
    client = client or http_client

    token = await _get_access_token(client)
    message = {
        "subject": subject,
        "body": {"contentType": "Text", "content": body_text},
        "toRecipients": [{"emailAddress": {"address": recipient}}],
        "attachments": [
            {
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": attachment_filename,
                "contentType": attachment_content_type,
                "contentBytes": base64.b64encode(attachment_bytes).decode("ascii"),
            }
        ],
    }
    if reply_to:
        message["replyTo"] = [{"emailAddress": {"address": reply_to}}]

    response = await client.post(
        SEND_MAIL_URL.format(sender=quote(sender_user)),
        json={"message": message, "saveToSentItems": False},
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code in {200, 202}:
        return

    logger.error("graph_send_mail_failed status=%s", response.status_code)
    if response.status_code in {401, 403}:
        raise GraphMailError(
            "Microsoft Graph mail send denied. Verify Mail.Send application permission "
            "and admin consent for the app registration."
        )
    raise GraphMailError("Failed to send billing email via Microsoft Graph.")
