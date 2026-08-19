from app.services.call_schedule_import import (
    _parse_header_date,
    parse_call_schedule_upload,
)


def test_parse_header_date_accepts_sept_and_sep():
    assert _parse_header_date("Sep 1 2026") == "2026-09-01"
    assert _parse_header_date("Sept 1 2026") == "2026-09-01"
    assert _parse_header_date("Sept 30 2026") == "2026-09-30"


def test_parse_header_date_accepts_comma_after_day():
    assert _parse_header_date("September 1, 2026") == "2026-09-01"
    assert _parse_header_date("Sep 1, 2026") == "2026-09-01"
    assert _parse_header_date("Sept 1, 2026") == "2026-09-01"


def test_parse_header_date_accepts_mm_dd_yyyy():
    assert _parse_header_date("09/01/2026") == "2026-09-01"
    assert _parse_header_date("9/1/2026") == "2026-09-01"
    assert _parse_header_date("12/31/2026") == "2026-12-31"
    assert _parse_header_date("3/1/26") == "2026-03-01"


def test_parse_csv_with_mm_dd_yyyy_headers():
    csv_text = """Label,09/01/2026,09/02/2026,09/03/2026
North Pod,OCM: PO,OCM: TH,OCM: PO
Central Pod,,SMMC: MK,
South Pod,LH: JR,,
"""
    parsed = parse_call_schedule_upload(csv_text.encode("utf-8"), "schedule.csv")
    assert parsed["2026-09-01"]["North Pod"] == [{"location": "OCM", "practitioner": "PO"}]
    assert parsed["2026-09-02"]["North Pod"] == [{"location": "OCM", "practitioner": "TH"}]


def test_parse_csv_with_sept_headers_reads_september():
    csv_text = """Mar 1 2026,Aug 31 2026,Sept 1 2026,Sept 2 2026,Oct 1 2026
North Pod,OCM: PO,OCM: TH,OCM: PO,OCM: TH
Central Pod,,SMMC: MK,,SMMC: EP
South Pod,LH: JR,,MH: PS,
"""
    parsed = parse_call_schedule_upload(csv_text.encode("utf-8"), "schedule.csv")
    assert "2026-09-01" in parsed
    assert "2026-09-02" in parsed
    assert parsed["2026-09-01"]["North Pod"] == [{"location": "OCM", "practitioner": "TH"}]
