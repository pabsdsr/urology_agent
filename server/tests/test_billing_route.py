from unittest.mock import Mock

import pytest

from app.routes.billing import _inline_content_disposition, _validate_icd10_code


def test_inline_content_disposition_strips_unicode_from_camera_filenames():
    header = _inline_content_disposition(
        "IMG_1234\u202fcopy.png",
        "4f9fdadb-f530-4c36-aa4d-1213240a09b1",
        "image/png",
    )
    assert "\u202f" not in header
    header.encode("latin-1")
    assert "filename=" in header


def test_validate_icd10_accepts_valid_codes():
    assert _validate_icd10_code("N40.1")
    assert _validate_icd10_code("a01")


def test_validate_icd10_rejects_bad_values():
    assert not _validate_icd10_code("12")
    assert not _validate_icd10_code("123.4")


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
    assert save_mock.call_args.kwargs["submitter_email"] == "test@example.com"


def test_submit_billing_success_without_sheet(monkeypatch, authenticated_client):
    save_mock = Mock(return_value={"id": "sub-no-sheet"})
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
    )

    assert response.status_code == 200
    assert save_mock.call_args.kwargs["billing_sheet_bytes"] is None


def test_submit_billing_accepts_multiple_codes(monkeypatch, authenticated_client):
    save_mock = Mock(return_value={"id": "sub-multi"})
    monkeypatch.setattr("app.routes.billing.save_submission", save_mock)

    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "01/15/1990",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798, 99213",
            "icd10_code": "N40.1, R35",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 200
    assert save_mock.call_args.kwargs["cpt_code"] == "51798, 99213"
    assert save_mock.call_args.kwargs["cpt_modifiers"] == ""


def test_submit_billing_accepts_cpt_lines_json(authenticated_client, monkeypatch):
    save_mock = Mock(return_value={"id": "sub-lines"})
    monkeypatch.setattr("app.routes.billing.save_submission", save_mock)

    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "01/15/1990",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_lines": '[{"code":"51798","modifiers":["25"]},{"code":"99213","modifiers":["57"]}]',
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 200
    kwargs = save_mock.call_args.kwargs
    assert kwargs["cpt_code"] == "51798, 99213"
    assert kwargs["cpt_modifiers"] == "25, 57"
    assert kwargs["cpt_lines"] == [
        {"code": "51798", "modifiers": ["25"]},
        {"code": "99213", "modifiers": ["57"]},
    ]


def test_submit_billing_accepts_cpt_modifiers(authenticated_client, monkeypatch):
    save_mock = Mock(return_value={"id": "sub-modifiers"})
    monkeypatch.setattr("app.routes.billing.save_submission", save_mock)

    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "01/15/1990",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "cpt_code": "51798",
            "icd10_code": "N40.1",
            "cpt_modifiers": "-25, 57",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )

    assert response.status_code == 200
    assert save_mock.call_args.kwargs["cpt_modifiers"] == "25, 57"
    assert save_mock.call_args.kwargs["cpt_lines"] == [{"code": "51798", "modifiers": ["25", "57"]}]


@pytest.mark.parametrize(
    "missing_field,expected_detail",
    [
        ("date_of_service", "date of service"),
        ("provider_name", "provider name"),
    ],
)
def test_submit_billing_requires_core_fields(
    authenticated_client, missing_field, expected_detail
):
    data = {
        "patient_name": "Jane Doe",
        "patient_dob": "1990-01-01",
        "location": "North Pod",
        "date_of_service": "2026-05-10",
        "provider_name": "Dr. Urologist",
        "cpt_code": "51798",
        "icd10_code": "N40.1",
    }
    data.pop(missing_field)
    response = authenticated_client.post(
        "/billing/submit",
        data=data,
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )
    assert response.status_code == 400
    assert expected_detail in response.json()["detail"].lower()


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


def test_submit_billing_requires_fields(authenticated_client):
    response = authenticated_client.post(
        "/billing/submit",
        data={
            "patient_name": "Jane Doe",
            "patient_dob": "1990-01-01",
            "location": "North Pod",
            "date_of_service": "2026-05-10",
            "provider_name": "Dr. Urologist",
            "icd10_code": "N40.1",
        },
        files={"billing_sheet": ("sheet.png", b"png-bytes", "image/png")},
    )
    assert response.status_code == 400
    assert "cpt" in response.json()["detail"].lower()


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


def test_delete_billing_submission_success(monkeypatch, non_admin_client):
    delete_mock = Mock(return_value=True)
    monkeypatch.setattr("app.routes.billing.delete_submission", delete_mock)
    response = non_admin_client.delete("/billing/submissions/sub-1")
    assert response.status_code == 200
    assert response.json()["status"] == "deleted"


def test_update_billing_submission_success(monkeypatch, non_admin_client):
    update_mock = Mock(return_value={"id": "sub-1", "patient_name": "Jane Doe Updated"})
    monkeypatch.setattr("app.routes.billing.update_submission", update_mock)

    response = non_admin_client.patch(
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
    assert response.json()["submission"]["patient_name"] == "Jane Doe Updated"


def test_submit_billing_forbidden_for_outsider(billing_outsider_client):
    response = billing_outsider_client.post(
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
    )
    assert response.status_code == 403


def test_billing_role_can_mark_processed_and_delete(billing_processor_client, monkeypatch):
    monkeypatch.setattr(
        "app.routes.billing.set_submission_processed",
        Mock(return_value={"id": "sub-1", "processed": True}),
    )
    monkeypatch.setattr("app.routes.billing.delete_submission", Mock(return_value=True))
    processed = billing_processor_client.patch(
        "/billing/submissions/sub-1/processed",
        json={"processed": True},
    )
    assert processed.status_code == 200

    delete = billing_processor_client.delete("/billing/submissions/sub-1")
    assert delete.status_code == 200


def test_staff_can_delete_but_not_mark_processed(billing_staff_only_client, monkeypatch):
    monkeypatch.setattr("app.routes.billing.delete_submission", Mock(return_value=True))
    delete = billing_staff_only_client.delete("/billing/submissions/sub-1")
    assert delete.status_code == 200

    processed = billing_staff_only_client.patch(
        "/billing/submissions/sub-1/processed",
        json={"processed": True},
    )
    assert processed.status_code == 403
