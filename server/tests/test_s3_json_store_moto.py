"""Integration tests for the S3 conditional-write engine against a moto-backed S3.

Unlike test_s3_json_store.py (which uses a hand-rolled fake), these drive the
real boto3 -> S3 code path, so they validate the assumptions the fake can't:
that boto3 forwards If-Match/If-None-Match, that the ETag round-trips, and that
the precondition failure surfaces with the error shape we retry on.
"""
import json

import boto3
import pytest
from moto import mock_aws

from app.services import s3_json_store

BUCKET = "test-bucket"
KEY = "doc.json"


@pytest.fixture
def s3_client(monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_SESSION_TOKEN", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket=BUCKET)
        yield client


def _update(client, mutate, **overrides):
    kwargs = dict(
        use_s3=True,
        client=client,
        bucket=BUCKET,
        key=KEY,
        local_path="/unused",
        default_factory=list,
        label="test",
        mutate=mutate,
    )
    kwargs.update(overrides)
    return s3_json_store.update_json_document(**kwargs)


def _read(client):
    body = client.get_object(Bucket=BUCKET, Key=KEY)["Body"].read()
    return json.loads(body)


def _put(client, value):
    client.put_object(Bucket=BUCKET, Key=KEY, Body=json.dumps(value).encode("utf-8"))


def test_create_then_update(s3_client):
    created = _update(s3_client, lambda data: data + [{"id": "a"}])
    assert created == [{"id": "a"}]
    assert _read(s3_client) == [{"id": "a"}]

    _update(s3_client, lambda data: data + [{"id": "b"}])
    assert {x["id"] for x in _read(s3_client)} == {"a", "b"}


def test_conditional_create_does_not_clobber_racing_create(s3_client):
    # Object is absent, so the first write uses If-None-Match: *. A racing writer
    # creates it first; our create must lose the race and retry as an update.
    state = {"interfered": False}

    def mutate(data):
        if not state["interfered"]:
            state["interfered"] = True
            _put(s3_client, [{"id": "first"}])
        return data + [{"id": "second"}]

    result = _update(s3_client, mutate)
    assert {x["id"] for x in result} == {"first", "second"}
    assert {x["id"] for x in _read(s3_client)} == {"first", "second"}


def test_retry_preserves_concurrent_write(s3_client):
    _put(s3_client, [{"id": "a"}])
    state = {"interfered": False}

    def mutate(data):
        if not state["interfered"]:
            state["interfered"] = True
            # Another writer commits [a, b] after we read but before our put.
            _put(s3_client, [{"id": "a"}, {"id": "b"}])
        return data + [{"id": "mine"}]

    result = _update(s3_client, mutate)
    assert {x["id"] for x in result} == {"a", "b", "mine"}
    assert {x["id"] for x in _read(s3_client)} == {"a", "b", "mine"}


def test_exhausts_retries_raises(s3_client):
    _put(s3_client, [])
    counter = {"n": 0}

    def mutate(data):
        # Commit a distinct competing change before every put so If-Match never
        # holds and the conditional write keeps failing.
        counter["n"] += 1
        _put(s3_client, [{"n": counter["n"]}])
        return data + [{"mine": counter["n"]}]

    with pytest.raises(RuntimeError):
        _update(s3_client, mutate, max_retries=3)


def test_skip_when_mutate_returns_none(s3_client):
    _put(s3_client, [{"id": "a"}])
    result = _update(s3_client, lambda data: None)
    assert result == [{"id": "a"}]
    assert _read(s3_client) == [{"id": "a"}]
