from app.services.patient_info_service import clean_patient_data, hash_patient_data, parse_xml_blocking


def test_clean_patient_data_removes_metadata_fields():
    source = [
        {
            "resourceType": "Bundle",
            "id": "bundle-1",
            "meta": {"version": 1},
            "entry": [
                {
                    "fullUrl": "x",
                    "resource": {
                        "resourceType": "Patient",
                        "id": "p1",
                        "meta": {"version": 2},
                        "name": [{"family": "Doe"}],
                    },
                }
            ],
        }
    ]
    cleaned = clean_patient_data(source)
    assert "id" not in cleaned[0]
    assert "meta" not in cleaned[0]
    assert "fullUrl" not in cleaned[0]["entry"][0]
    assert "id" not in cleaned[0]["entry"][0]["resource"]


def test_hash_patient_data_is_stable_and_changes():
    payload = [{"resourceType": "Patient", "name": [{"family": "Doe"}]}]
    first = hash_patient_data(payload)
    second = hash_patient_data(payload)
    changed = hash_patient_data([{"resourceType": "Patient", "name": [{"family": "Roe"}]}])
    assert first == second
    assert first != changed


def test_parse_xml_blocking_returns_dict_or_input():
    parsed = parse_xml_blocking("<root><item>ok</item></root>")
    assert parsed["root"]["item"] == "ok"
    bad = parse_xml_blocking("<not-xml")
    assert bad == "<not-xml"
