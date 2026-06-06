from io import BytesIO

from app.services import billing_submission_store


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
    assert updated.get("updated_at")

    marked = billing_submission_store.set_submission_processed(entry["id"], processed=True)
    assert marked is not None
    assert marked["processed"] is True

    assert billing_submission_store.delete_submission(entry["id"]) is True
    assert billing_submission_store.list_submissions(limit=10, offset=0) == []
    assert billing_submission_store.load_billing_sheet(entry["id"]) is None


def test_load_billing_sheet_tries_s3_key_fallbacks(monkeypatch):
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
