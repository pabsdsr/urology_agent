def test_search_cpt_codes_route(authenticated_client):
    response = authenticated_client.get("/billing/codes/cpt?q=51798")
    assert response.status_code == 200
    codes = response.json()["codes"]
    assert any(item["code"] == "51798" for item in codes)


def test_search_icd10_codes_route(authenticated_client):
    response = authenticated_client.get("/billing/codes/icd10?q=hematuria")
    assert response.status_code == 200
    codes = response.json()["codes"]
    assert len(codes) > 0
