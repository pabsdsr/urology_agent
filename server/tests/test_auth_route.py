from fastapi.testclient import TestClient

from app.main import create_app


def test_auth_me_returns_profile(authenticated_client):
    response = authenticated_client.get("/auth/me")
    assert response.status_code == 200
    assert response.json()["username"] == "test-user"
    assert response.json()["is_admin"] is True


def test_auth_logout_always_returns_success(authenticated_client):
    response = authenticated_client.post("/auth/logout")
    assert response.status_code == 200
    assert response.json()["message"] == "Logged out successfully"


def test_auth_me_requires_bearer_without_override():
    app = create_app()
    client = None
    try:
        client = TestClient(app)
        response = client.get("/auth/me")
        assert response.status_code == 401
    finally:
        if client is not None:
            client.close()
