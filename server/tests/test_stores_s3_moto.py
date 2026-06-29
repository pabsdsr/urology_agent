"""End-to-end store tests in S3 mode, backed by moto.

These exercise the real store functions (billing index + sheets, call schedule)
against an emulated S3 to confirm the conditional-write wiring works through the
full code path, not just the helper in isolation.
"""
import boto3
import pytest
from moto import mock_aws

from app.services import billing_submission_store as billing
from app.services import call_schedule_service as schedule


@pytest.fixture
def s3(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        yield boto3.client("s3", region_name="us-east-1")


def test_billing_store_s3_roundtrip(s3, monkeypatch):
    s3.create_bucket(Bucket="billing-bucket")
    monkeypatch.setattr(billing, "_s3_client", s3)
    monkeypatch.setattr(billing, "BILLING_S3_BUCKET", "billing-bucket")

    entry = billing.save_submission(
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

    listed = billing.list_submissions(limit=10, offset=0)
    assert len(listed) == 1
    assert listed[0]["patient_name"] == "Jane Doe"

    sheet = billing.load_billing_sheet(entry["id"])
    assert sheet is not None and sheet[0] == b"fake-image"

    updated = billing.update_submission(
        entry["id"],
        patient_name="Jane Doe Updated",
        patient_dob="1990-01-01",
        location="West Pod",
        date_of_service="2026-05-02",
        provider_name="Dr. Jones",
        cpt_code="51798",
        icd10_code="N40.2",
    )
    assert updated is not None and updated["patient_name"] == "Jane Doe Updated"

    marked = billing.set_submission_processed(entry["id"], processed=True)
    assert marked is not None and marked["processed"] is True

    assert billing.delete_submission(entry["id"]) is True
    assert billing.list_submissions(limit=10, offset=0) == []


def test_billing_store_s3_two_writes_no_lost_update(s3, monkeypatch):
    s3.create_bucket(Bucket="billing-bucket")
    monkeypatch.setattr(billing, "_s3_client", s3)
    monkeypatch.setattr(billing, "BILLING_S3_BUCKET", "billing-bucket")

    common = dict(
        patient_dob="1990-01-01",
        location="Central Pod",
        date_of_service="2026-05-01",
        provider_name="Dr. Smith",
        cpt_code="51798",
        icd10_code="N40.1",
        submitted_by="user@test.com",
        submitter_email="user@test.com",
        practice_url="demo",
    )
    billing.save_submission(patient_name="First", **common)
    billing.save_submission(patient_name="Second", **common)

    names = {e["patient_name"] for e in billing.list_submissions(limit=10, offset=0)}
    assert names == {"First", "Second"}


def test_call_schedule_s3_roundtrip(s3, monkeypatch):
    s3.create_bucket(Bucket="schedule-bucket")
    monkeypatch.setattr(schedule, "_s3_client", s3)
    monkeypatch.setattr(schedule, "CALL_SCHEDULE_S3_BUCKET", "schedule-bucket")

    schedule.update_week(
        "2026-05-24",
        {
            "2026-05-24": {
                "North Pod": [{"location": "North", "practitioner": "Dr. A"}],
                "Central Pod": [],
                "South Pod": [],
            }
        },
    )
    # A second week write must not clobber the first (conditional update).
    schedule.update_week(
        "2026-05-25",
        {
            "2026-05-25": {
                "North Pod": [{"location": "North", "practitioner": "Dr. B"}],
                "Central Pod": [],
                "South Pod": [],
            }
        },
    )

    result = schedule.get_call_schedule_range("2026-05-24", "2026-05-25")
    assert set(result.keys()) == {"2026-05-24", "2026-05-25"}
    assert result["2026-05-24"]["North Pod"][0]["practitioner"] == "Dr. A"
    assert result["2026-05-25"]["North Pod"][0]["practitioner"] == "Dr. B"
