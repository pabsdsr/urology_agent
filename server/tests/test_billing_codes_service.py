from app.services.billing_codes_service import search_cpt_codes, search_icd10_codes


def test_search_cpt_by_code_prefix():
    results = search_cpt_codes("5179", limit=10)
    assert any(item["code"] == "51798" for item in results)


def test_search_cpt_by_description():
    results = search_cpt_codes("cystourethroscopy", limit=10)
    assert len(results) > 0
    assert "cystourethroscopy" in results[0]["description"].lower()


def test_search_icd10_by_code():
    results = search_icd10_codes("N40", limit=10)
    assert any(item["code"].startswith("N40") for item in results)


def test_search_empty_query_returns_limited_list():
    results = search_icd10_codes("", limit=5)
    assert len(results) == 5


def test_search_no_match_returns_empty():
    results = search_cpt_codes("ZZZZNOTACODE", limit=10)
    assert results == []
