from app.routes.billing import _validate_cpt_code, _validate_icd10_code


def test_validate_cpt_code_accepts_5_or_6():
    assert _validate_cpt_code("51798")
    assert _validate_cpt_code("1234F")


def test_validate_cpt_code_rejects_bad_values():
    assert not _validate_cpt_code("")
    assert not _validate_cpt_code("123")
    assert not _validate_cpt_code("ABCDE")


def test_validate_icd10_accepts_valid_codes():
    assert _validate_icd10_code("N40.1")
    assert _validate_icd10_code("a01")


def test_validate_icd10_rejects_bad_values():
    assert not _validate_icd10_code("12")
    assert not _validate_icd10_code("123.4")
