from app.services import patient_info_service


class _FakePage:
    def __init__(self, text, tables):
        self._text = text
        self._tables = tables

    def extract_text(self):
        return self._text

    def extract_tables(self):
        return self._tables


class _FakePdf:
    def __init__(self, pages):
        self.pages = pages

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_parse_pdf_bytes_includes_text_and_tables(monkeypatch):
    fake_pdf = _FakePdf(
        [
            _FakePage("Summary", [[["A", "B"], ["1", "2"]]]),
            _FakePage("Second page", []),
        ]
    )
    monkeypatch.setattr(patient_info_service.pdfplumber, "open", lambda *_: fake_pdf)
    result = patient_info_service.parse_pdf_bytes(b"fake-bytes")
    assert "Summary" in result
    assert "A\tB" in result
    assert "Second page" in result
