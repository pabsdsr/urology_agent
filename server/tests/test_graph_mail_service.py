import httpx
import pytest

from app.services.graph_mail_service import GraphMailError, _env, _get_access_token, send_billing_email_via_graph


class FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = []

    async def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self._responses.pop(0)


def _json_response(status_code: int, payload: dict):
    return httpx.Response(status_code=status_code, json=payload, request=httpx.Request("POST", "https://test"))


@pytest.mark.asyncio
async def test_get_access_token_success(monkeypatch):
    monkeypatch.setenv("GRAPH_TENANT_ID", "tenant")
    monkeypatch.setenv("GRAPH_CLIENT_ID", "client")
    monkeypatch.setenv("GRAPH_CLIENT_SECRET", "secret")
    client = FakeClient([_json_response(200, {"access_token": "token-123"})])
    token = await _get_access_token(client)
    assert token == "token-123"


def test_env_uses_fallback(monkeypatch):
    monkeypatch.delenv("GRAPH_TENANT_ID", raising=False)
    monkeypatch.setenv("ENTRA_TENANT_ID", "entra-tenant")
    assert _env("GRAPH_TENANT_ID", "ENTRA_TENANT_ID") == "entra-tenant"


@pytest.mark.asyncio
async def test_send_billing_email_success(monkeypatch):
    monkeypatch.setenv("GRAPH_SENDER_USER", "sender@example.com")
    monkeypatch.setenv("GRAPH_TENANT_ID", "tenant")
    monkeypatch.setenv("GRAPH_CLIENT_ID", "client")
    monkeypatch.setenv("GRAPH_CLIENT_SECRET", "secret")
    client = FakeClient([_json_response(200, {"access_token": "token"}), _json_response(202, {})])

    await send_billing_email_via_graph(
        subject="subject",
        body_text="body",
        recipient="billing@example.com",
        reply_to="reply@example.com",
        attachment_filename="sheet.png",
        attachment_content_type="image/png",
        attachment_bytes=b"bytes",
        client=client,
    )

    assert len(client.calls) == 2
    send_call = client.calls[1]
    assert "graph.microsoft.com" in send_call[0]
    assert send_call[1]["headers"]["Authorization"] == "Bearer token"


@pytest.mark.asyncio
async def test_send_billing_email_permission_error(monkeypatch):
    monkeypatch.setenv("GRAPH_SENDER_USER", "sender@example.com")
    monkeypatch.setenv("GRAPH_TENANT_ID", "tenant")
    monkeypatch.setenv("GRAPH_CLIENT_ID", "client")
    monkeypatch.setenv("GRAPH_CLIENT_SECRET", "secret")
    client = FakeClient([_json_response(200, {"access_token": "token"}), _json_response(403, {})])

    with pytest.raises(GraphMailError, match="Mail.Send"):
        await send_billing_email_via_graph(
            subject="subject",
            body_text="body",
            recipient="billing@example.com",
            reply_to=None,
            attachment_filename="sheet.png",
            attachment_content_type="image/png",
            attachment_bytes=b"bytes",
            client=client,
        )
