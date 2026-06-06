from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.models import SessionUser
from app.routes.auth import get_current_user, require_modmed_session


@pytest.fixture
def mock_session_user() -> SessionUser:
    now = datetime.now(timezone.utc)
    return SessionUser(
        username="test-user",
        email="test@example.com",
        practice_url="demo-practice",
        practice_api_key="demo-api-key",
        modmed_access_token="demo-modmed-token",
        is_admin=True,
        roles=["admin", "practitioner", "billing"],
        billing_staff=True,
        billing_processor=True,
        auth_method="entra",
        created_at=now,
        expires_at=now + timedelta(hours=1),
    )


@pytest.fixture
def non_admin_user(mock_session_user: SessionUser) -> SessionUser:
    return mock_session_user.model_copy(update={"is_admin": False})


def _override_user(user: SessionUser):
    async def _resolver():
        return user

    return _resolver


@pytest.fixture
def authenticated_client(mock_session_user: SessionUser):
    app = create_app()
    resolver = _override_user(mock_session_user)
    app.dependency_overrides[get_current_user] = resolver
    app.dependency_overrides[require_modmed_session] = resolver
    with TestClient(app) as client:
        yield client


@pytest.fixture
def non_admin_client(non_admin_user: SessionUser):
    app = create_app()
    resolver = _override_user(non_admin_user)
    app.dependency_overrides[get_current_user] = resolver
    app.dependency_overrides[require_modmed_session] = resolver
    with TestClient(app) as client:
        yield client


@pytest.fixture
def billing_staff_only_user(mock_session_user: SessionUser) -> SessionUser:
    return mock_session_user.model_copy(
        update={
            "email": "staff@example.com",
            "username": "staff@example.com",
            "is_admin": False,
            "roles": ["practitioner"],
            "billing_staff": True,
            "billing_processor": False,
        }
    )


@pytest.fixture
def billing_staff_only_client(billing_staff_only_user: SessionUser):
    app = create_app()
    resolver = _override_user(billing_staff_only_user)
    app.dependency_overrides[get_current_user] = resolver
    app.dependency_overrides[require_modmed_session] = resolver
    with TestClient(app) as client:
        yield client


@pytest.fixture
def billing_processor_only_user(mock_session_user: SessionUser) -> SessionUser:
    return mock_session_user.model_copy(
        update={
            "email": "processor@example.com",
            "username": "processor@example.com",
            "is_admin": False,
            "roles": ["billing"],
            "billing_staff": True,
            "billing_processor": True,
        }
    )


@pytest.fixture
def billing_outsider_user(mock_session_user: SessionUser) -> SessionUser:
    return mock_session_user.model_copy(
        update={
            "email": "outsider@example.com",
            "username": "outsider@example.com",
            "is_admin": False,
            "roles": [],
            "billing_staff": False,
            "billing_processor": False,
        }
    )


@pytest.fixture
def billing_processor_client(billing_processor_only_user: SessionUser):
    app = create_app()
    resolver = _override_user(billing_processor_only_user)
    app.dependency_overrides[get_current_user] = resolver
    app.dependency_overrides[require_modmed_session] = resolver
    with TestClient(app) as client:
        yield client


@pytest.fixture
def billing_outsider_client(billing_outsider_user: SessionUser):
    app = create_app()
    resolver = _override_user(billing_outsider_user)
    app.dependency_overrides[get_current_user] = resolver
    app.dependency_overrides[require_modmed_session] = resolver
    with TestClient(app) as client:
        yield client


@pytest.fixture(autouse=True)
def default_test_env(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("BILLING_S3_BUCKET", raising=False)
    monkeypatch.delenv("CALL_SCHEDULE_S3_BUCKET", raising=False)
