import httpx

from app import routes


class _FakeAsyncClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, *args, **kwargs):
        return self._response


def _response(status_code: int, payload: dict):
    return httpx.Response(status_code=status_code, json=payload, request=httpx.Request("GET", "https://test"))


def test_search_patients_requires_query(authenticated_client):
    response = authenticated_client.get("/patients")
    assert response.status_code == 400


def test_search_patients_maps_entries(monkeypatch, authenticated_client):
    payload = {
        "entry": [
            {
                "resource": {
                    "id": "p-1",
                    "name": [{"family": "Doe", "given": ["Jane"]}],
                    "birthDate": "1990-01-01",
                }
            }
        ]
    }
    monkeypatch.setattr(
        routes.patients.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(_response(200, payload)),
    )

    response = authenticated_client.get("/patients?given=Jane")
    assert response.status_code == 200
    assert response.json() == [
        {"id": "p-1", "familyName": "Doe", "givenName": "Jane", "dob": "1990-01-01"}
    ]


def test_search_patients_handles_upstream_failure(monkeypatch, authenticated_client):
    monkeypatch.setattr(
        routes.patients.httpx,
        "AsyncClient",
        lambda **kwargs: _FakeAsyncClient(_response(500, {})),
    )
    response = authenticated_client.get("/patients?family=Doe")
    assert response.status_code == 502
