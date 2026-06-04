from unittest.mock import Mock

from app.routes.billing import _inline_content_disposition
from app.services import billing_submission_store


def test_inline_content_disposition_strips_unicode_from_camera_filenames():
    header = _inline_content_disposition(
        "IMG_1234\u202fcopy.png",
        "4f9fdadb-f530-4c36-aa4d-1213240a09b1",
        "image/png",
    )
    assert "\u202f" not in header
    header.encode("latin-1")
    assert "filename=" in header


def test_submit_billing_success(monkeypatch, authenticated_client):
    save_mock = Mock(
        return_value={
            "id": "sub-123",
            "submitted_at": "2026-05-28T12:00:00+00:00",
            "patient_name": "Jane Doe",
        }
    )
    monkeypatch.setattr("app.routes.billing.save_submission", save_mock)

    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "submitted"
    assert body["submission_id"] == "sub-123"
    save_mock.assert_called_once()
    assert save_mock.call_args.kwargs["location"] == "North Pod"
    assert save_mock.call_args.kwargs["submitter_email"] == "test@example.com"


def test_submit_billing_rejects_non_image(authenticated_client):
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.txt", b"not-image", "text/plain")},
    )

    assert response.status_code == 400
    assert "supported image" in response.json()["detail"]


def test_submit_billing_requires_date_of_service(authenticated_client):
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )
    assert response.status_code == 400
    assert "date of service" in response.json()["detail"].lower()


def test_submit_billing_requires_provider_name(authenticated_client):
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )
    assert response.status_code == 400
    assert "provider name" in response.json()["detail"].lower()


def test_submit_billing_requires_fields(authenticated_client):
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 422


def test_submit_billing_rejects_large_image(monkeypatch, authenticated_client):
    monkeypatch.setattr("app.routes.billing.MAX_IMAGE_BYTES", 8)
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"0123456789", "image/png")},
    )
    assert response.status_code == 400
    assert "10MB limit" in response.json()["detail"]


def test_list_billing_submissions(monkeypatch, authenticated_client):
    monkeypatch.setattr(
        "app.routes.billing.list_submissions",
        lambda limit, offset: [{"id": "sub-1", "patient_name": "Jane Doe"}],
    )
    response = authenticated_client.get("/billing/submissions?limit=10&offset=0")
    assert response.status_code == 200
    assert response.json()["submissions"][0]["id"] == "sub-1"


def test_get_billing_sheet_not_found(monkeypatch, authenticated_client):
    monkeypatch.setattr("app.routes.billing.load_billing_sheet", lambda _id: None)
    response = authenticated_client.get("/billing/submissions/missing/sheet")
    assert response.status_code == 404


def test_get_billing_sheet_success(monkeypatch, authenticated_client):
    monkeypatch.setattr(
        "app.routes.billing.load_billing_sheet",
        lambda _id: (b"img", "image/png", "sheet.png"),
    )
    response = authenticated_client.get("/billing/submissions/sub-1/sheet")
    assert response.status_code == 200
    assert response.content == b"img"
    assert response.headers["content-type"].startswith("image/png")


def test_billing_submission_store_roundtrip(tmp_path, monkeypatch):
    data_dir = tmp_path / "data"
    sheets_dir = data_dir / "billing_sheets"
    monkeypatch.setattr(billing_submission_store, "_DATA_DIR", str(data_dir))
    monkeypatch.setattr(
        billing_submission_store,
        "LOCAL_INDEX_PATH",
        str(data_dir / "billing_submissions.json"),
    )
    monkeypatch.setattr(billing_submission_store, "LOCAL_SHEETS_DIR", str(sheets_dir))
    monkeypatch.setattr(billing_submission_store, "_s3_client", None)
    monkeypatch.setattr(billing_submission_store, "BILLING_S3_BUCKET", "")

    entry = billing_submission_store.save_submission(
        patient_name="Jane Doe",
        patient_dob="1990-01-01",
        location="Central Pod",
        date_of_service="2026-05-01",
        provider_name="Dr. Smith",
        cpt_code="51798",
        icd10_code="N40.1",
        submitted_by="user@test.com",
        submitter_email="user@test.com",
        practice_url="demo",
        billing_sheet_filename="sheet.png",
        billing_sheet_content_type="image/png",
        billing_sheet_bytes=b"fake-image",
    )
    assert entry["id"]
    listed = billing_submission_store.list_submissions(limit=10, offset=0)
    assert listed[0]["location"] == "Central Pod"
    loaded = billing_submission_store.load_billing_sheet(entry["id"])
    assert loaded is not None
    assert loaded[0] == b"fake-image"

    updated = billing_submission_store.update_submission(
        entry["id"],
        patient_name="Jane Doe Updated",
        patient_dob="1990-01-01",
        location="West Pod",
        date_of_service="2026-05-02",
        provider_name="Dr. Jones",
        cpt_code="51798",
        icd10_code="N40.2",
    )
    assert updated is not None
    assert updated["patient_name"] == "Jane Doe Updated"
    assert updated["location"] == "West Pod"
    assert updated.get("updated_at")

    listed_after_update = billing_submission_store.list_submissions(limit=10, offset=0)
    assert listed_after_update[0]["patient_name"] == "Jane Doe Updated"

    marked = billing_submission_store.set_submission_processed(entry["id"], processed=True)
    assert marked is not None
    assert marked["processed"] is True
    listed_processed = billing_submission_store.list_submissions(limit=10, offset=0)
    assert listed_processed[0]["processed"] is True

    assert billing_submission_store.delete_submission(entry["id"]) is True
    assert billing_submission_store.list_submissions(limit=10, offset=0) == []
    assert billing_submission_store.load_billing_sheet(entry["id"]) is None
    assert billing_submission_store.delete_submission(entry["id"]) is False


def test_set_billing_submission_processed(monkeypatch, authenticated_client):
    processed_mock = Mock(
        return_value={"id": "sub-1", "patient_name": "Jane Doe", "processed": True}
    )
    monkeypatch.setattr("app.routes.billing.set_submission_processed", processed_mock)

    response = authenticated_client.patch(
        "/billing/submissions/sub-1/processed",
        json={"processed": True},
    )
    assert response.status_code == 200
    assert response.json()["submission"]["processed"] is True
    processed_mock.assert_called_once_with("sub-1", processed=True)


def test_load_billing_sheet_tries_s3_key_fallbacks(monkeypatch):
    from io import BytesIO

    class _FakeS3:
        class exceptions:
            NoSuchKey = type("NoSuchKey", (Exception,), {})

        def __init__(self):
            self.objects = {"billing_sheets/sub-99.png": b"from-s3"}

        def get_object(self, Bucket, Key):
            if Key in self.objects:
                return {"Body": BytesIO(self.objects[Key])}
            raise self.exceptions.NoSuchKey()

    fake = _FakeS3()
    monkeypatch.setattr(billing_submission_store, "_s3_client", fake)
    monkeypatch.setattr(billing_submission_store, "BILLING_S3_BUCKET", "test-bucket")
    monkeypatch.setattr(
        billing_submission_store,
        "get_submission",
        lambda _id: {
            "id": "sub-99",
            "billing_sheet_storage_key": "billing_sheets/sub-99.png",
            "billing_sheet_content_type": "image/png",
            "billing_sheet_filename": "sheet.png",
        },
    )

    loaded = billing_submission_store.load_billing_sheet("sub-99")
    assert loaded is not None
    assert loaded[0] == b"from-s3"


def test_delete_billing_submission_success(monkeypatch, authenticated_client, mock_session_user):
    app = authenticated_client.app
    from app.routes.auth import get_current_user

    async def _allowed_user():
        return mock_session_user.model_copy(
            update={
                "email": "wkim@urologymedical.com",
                "username": "wkim@urologymedical.com",
            }
        )

    app.dependency_overrides[get_current_user] = _allowed_user
    delete_mock = Mock(return_value=True)
    monkeypatch.setattr("app.routes.billing.delete_submission", delete_mock)
    response = authenticated_client.delete("/billing/submissions/sub-1")
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"
    delete_mock.assert_called_once_with("sub-1")


def test_delete_billing_submission_not_found(
    monkeypatch, authenticated_client, mock_session_user
):
    from app.routes.auth import get_current_user

    async def _allowed_user():
        return mock_session_user.model_copy(
            update={
                "email": "wkim@urologymedical.com",
                "username": "wkim@urologymedical.com",
            }
        )

    authenticated_client.app.dependency_overrides[get_current_user] = _allowed_user
    monkeypatch.setattr("app.routes.billing.delete_submission", lambda _id: False)
    response = authenticated_client.delete("/billing/submissions/missing")
    assert response.status_code == 404


def test_delete_billing_submission_forbidden_for_other_users(non_admin_client):
    response = non_admin_client.delete("/billing/submissions/sub-1")
    assert response.status_code == 403


def _billing_admin_override(client, mock_session_user):
    from app.routes.auth import get_current_user

    async def _allowed_user():
        return mock_session_user.model_copy(
            update={
                "email": "wkim@urologymedical.com",
                "username": "wkim@urologymedical.com",
            }
        )

    client.app.dependency_overrides[get_current_user] = _allowed_user


def test_update_billing_submission_success(monkeypatch, authenticated_client, mock_session_user):
    _billing_admin_override(authenticated_client, mock_session_user)
    update_mock = Mock(
        return_value={
            "id": "sub-1",
            "patient_name": "Jane Doe Updated",
            "location": "South Pod",
        }
    )
    monkeypatch.setattr("app.routes.billing.update_submission", update_mock)

    response = authenticated_client.patch(
        "/billing/submissions/sub-1",
        data={
            "patient_name": "Jane Doe Updated",
            "patient_dob": "1990-01-01",
            "location": "South Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "updated"
    assert body["submission"]["patient_name"] == "Jane Doe Updated"
    update_mock.assert_called_once()
    assert update_mock.call_args.kwargs["location"] == "South Pod"


def test_update_billing_submission_not_found(
    monkeypatch, authenticated_client, mock_session_user
):
    _billing_admin_override(authenticated_client, mock_session_user)
    monkeypatch.setattr("app.routes.billing.update_submission", lambda *_a, **_k: None)
    response = authenticated_client.patch(
        "/billing/submissions/missing",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
    )
    assert response.status_code == 404


def test_update_billing_submission_forbidden_for_other_users(non_admin_client):
    response = non_admin_client.patch(
        "/billing/submissions/sub-1",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
        },
    )
    assert response.status_code == 403
