import json
from io import BytesIO

import pytest

from app.services import s3_json_store


class _PreconditionError(Exception):
    """Mimics botocore's ClientError shape for a failed conditional PutObject."""

    def __init__(self):
        self.response = {
            "Error": {"Code": "PreconditionFailed"},
            "ResponseMetadata": {"HTTPStatusCode": 412},
        }


class FakeS3:
    """Minimal in-memory S3 with ETag-conditional PutObject semantics."""

    class exceptions:
        NoSuchKey = type("NoSuchKey", (Exception,), {})

    def __init__(self):
        self.store: dict[str, tuple[bytes, str]] = {}  # key -> (body, etag)
        self._seq = 0
        self.put_calls = 0
        self.before_put = None  # hook to simulate a concurrent writer

    def get_object(self, Bucket, Key):
        if Key not in self.store:
            raise self.exceptions.NoSuchKey()
        body, etag = self.store[Key]
        return {"Body": BytesIO(body), "ETag": etag}

    def _next_etag(self) -> str:
        self._seq += 1
        return f'"etag-{self._seq}"'

    def put_object(self, Bucket, Key, Body, ContentType=None, IfMatch=None, IfNoneMatch=None):
        self.put_calls += 1
        if self.before_put:
            self.before_put()
        existing = self.store.get(Key)
        if IfNoneMatch == "*" and existing is not None:
            raise _PreconditionError()
        if IfMatch is not None and (existing is None or existing[1] != IfMatch):
            raise _PreconditionError()
        etag = self._next_etag()
        self.store[Key] = (bytes(Body), etag)
        return {"ETag": etag}


def _update(client, mutate, **overrides):
    kwargs = dict(
        use_s3=True,
        client=client,
        bucket="bucket",
        key="k",
        local_path="/unused",
        default_factory=list,
        label="test",
        mutate=mutate,
    )
    kwargs.update(overrides)
    return s3_json_store.update_json_document(**kwargs)


def test_s3_create_uses_if_none_match():
    fake = FakeS3()
    result = _update(fake, lambda data: data + [{"id": 1}])
    assert result == [{"id": 1}]
    assert json.loads(fake.store["k"][0]) == [{"id": 1}]
    assert fake.put_calls == 1


def test_s3_retry_preserves_concurrent_write():
    fake = FakeS3()
    fake.store["k"] = (json.dumps([{"id": "a"}]).encode(), '"etag-0"')

    state = {"interfered": False}

    def concurrent_writer():
        if not state["interfered"]:
            state["interfered"] = True
            # Another writer commits [a, b] after we read but before our put.
            fake.store["k"] = (json.dumps([{"id": "a"}, {"id": "b"}]).encode(), '"etag-99"')

    fake.before_put = concurrent_writer

    result = _update(fake, lambda data: data + [{"id": "mine"}])

    # The first put loses the race (412) and retries against the latest state,
    # so the concurrent "b" is preserved instead of being clobbered.
    assert {d["id"] for d in result} == {"a", "b", "mine"}
    assert fake.put_calls == 2


def test_s3_skips_write_when_mutate_returns_none():
    fake = FakeS3()
    fake.store["k"] = (json.dumps([{"id": "a"}]).encode(), '"etag-0"')
    result = _update(fake, lambda data: None)
    assert result == [{"id": "a"}]
    assert fake.put_calls == 0


def test_s3_raises_after_exhausting_retries():
    fake = FakeS3()
    fake.store["k"] = (json.dumps([]).encode(), '"etag-0"')

    def always_conflict():
        # Bump the ETag right before every put so If-Match never matches.
        fake.store["k"] = (json.dumps([]).encode(), f'"etag-x{fake.put_calls}"')

    fake.before_put = always_conflict

    with pytest.raises(RuntimeError):
        _update(fake, lambda data: data + [1], max_retries=3)
    assert fake.put_calls == 3


def test_local_roundtrip_and_skip(tmp_path):
    path = str(tmp_path / "doc.json")
    created = s3_json_store.update_json_document(
        use_s3=False,
        client=None,
        bucket="",
        key="",
        local_path=path,
        default_factory=list,
        label="test",
        mutate=lambda data: data + [{"id": 1}],
    )
    assert created == [{"id": 1}]

    unchanged = s3_json_store.update_json_document(
        use_s3=False,
        client=None,
        bucket="",
        key="",
        local_path=path,
        default_factory=list,
        label="test",
        mutate=lambda data: None,
    )
    assert unchanged == [{"id": 1}]
    assert json.loads(open(path).read()) == [{"id": 1}]
