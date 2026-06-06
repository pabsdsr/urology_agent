import pytest
from fastapi import HTTPException

from app.services.billing_cpt_lines import (
    cpt_lines_from_legacy,
    derive_legacy_cpt_fields,
    ensure_entry_cpt_lines,
    normalize_cpt_line,
    parse_cpt_lines_json,
    validate_cpt_code,
    validate_cpt_lines,
    validate_cpt_modifier,
)


def test_validate_cpt_code_accepts_5_or_6():
    assert validate_cpt_code("51798")
    assert validate_cpt_code("1234F")


def test_validate_cpt_code_rejects_bad_values():
    assert not validate_cpt_code("")
    assert not validate_cpt_code("123")
    assert not validate_cpt_code("ABCDE")


def test_validate_cpt_modifier_accepts_common_values():
    assert validate_cpt_modifier("25")
    assert validate_cpt_modifier("-57")
    assert validate_cpt_modifier("50")


def test_validate_cpt_modifier_rejects_bad_values():
    assert not validate_cpt_modifier("")
    assert not validate_cpt_modifier("123")
    assert not validate_cpt_modifier("A")


def test_normalize_cpt_line_deduplicates_modifiers():
    line = normalize_cpt_line({"code": "51798", "modifiers": ["25", "-25", "57"]})
    assert line == {"code": "51798", "modifiers": ["25", "57"]}


def test_cpt_lines_from_legacy_attaches_modifiers_to_first_code():
    lines = cpt_lines_from_legacy("51798, 99213", "25, 57")
    assert lines == [
        {"code": "51798", "modifiers": ["25", "57"]},
        {"code": "99213", "modifiers": []},
    ]


def test_parse_cpt_lines_json_prefers_json_payload():
    raw = '[{"code":"51798","modifiers":["25"]},{"code":"99213","modifiers":["57"]}]'
    lines = parse_cpt_lines_json(raw)
    assert lines == [
        {"code": "51798", "modifiers": ["25"]},
        {"code": "99213", "modifiers": ["57"]},
    ]


def test_parse_cpt_lines_json_falls_back_to_legacy_fields():
    lines = parse_cpt_lines_json("", cpt_code="51798", cpt_modifiers="25")
    assert lines == [{"code": "51798", "modifiers": ["25"]}]


def test_parse_cpt_lines_json_rejects_invalid_json():
    with pytest.raises(HTTPException) as exc:
        parse_cpt_lines_json("{not-json")
    assert exc.value.status_code == 400


def test_validate_cpt_lines_requires_at_least_one_code():
    with pytest.raises(HTTPException) as exc:
        validate_cpt_lines([])
    assert exc.value.status_code == 400


def test_validate_cpt_lines_rejects_bad_modifier():
    with pytest.raises(HTTPException) as exc:
        validate_cpt_lines([{"code": "51798", "modifiers": ["123"]}])
    assert "modifier" in exc.value.detail.lower()


def test_derive_legacy_cpt_fields():
    cpt_code, cpt_modifiers = derive_legacy_cpt_fields(
        [
            {"code": "51798", "modifiers": ["25", "57"]},
            {"code": "99213", "modifiers": ["57"]},
        ]
    )
    assert cpt_code == "51798, 99213"
    assert cpt_modifiers == "25, 57"


def test_ensure_entry_cpt_lines_from_legacy_row():
    entry = ensure_entry_cpt_lines({"cpt_code": "51798", "cpt_modifiers": "25"})
    assert entry["cpt_lines"] == [{"code": "51798", "modifiers": ["25"]}]
