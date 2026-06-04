from unittest.mock import Mock


def test_get_call_schedule_returns_payload(monkeypatch, authenticated_client):
    monkeypatch.setattr(
        "app.routes.call_schedule.get_call_schedule_range",
        lambda start, end: {"2026-05-24": {"North Pod": []}},
    )
    response = authenticated_client.get("/call-schedule?start=2026-05-24&end=2026-05-30")
    assert response.status_code == 200
    assert "call_schedule" in response.json()


def test_save_call_schedule_requires_days(authenticated_client):
    response = authenticated_client.post("/call-schedule/week", json={"week_start": "2026-05-24", "days": {}})
    assert response.status_code == 400


def test_save_call_schedule_normalizes_entries(monkeypatch, authenticated_client):
    update_week_mock = Mock()
    monkeypatch.setattr("app.routes.call_schedule.update_week", update_week_mock)
    response = authenticated_client.post(
        "/call-schedule/week",
        json={
            "week_start": "2026-05-24",
            "days": {
                "2026-05-24": {
                    "date": "2026-05-24",
                    "north": [{"location": "A", "practitioner": "Dr. X"}],
                    "central": [{}],
                    "south": [],
                }
            },
        },
    )
    assert response.status_code == 200
    assert response.json()["success"] is True
    update_week_mock.assert_called_once()


def test_changelog_forbidden_for_non_admin(non_admin_client):
    response = non_admin_client.get("/call-schedule/changelog")
    assert response.status_code == 403
