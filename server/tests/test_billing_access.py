from app.services.billing_access import (
    billing_flags_from_roles,
    billing_processor_role,
    billing_staff_role,
    can_view_billing,
    is_billing_processor,
    is_billing_staff,
)


def test_billing_staff_role(monkeypatch):
    monkeypatch.delenv("ENTRA_BILLING_STAFF_APP_ROLE", raising=False)
    monkeypatch.delenv("ENTRA_BILLING_PROCESSOR_APP_ROLE", raising=False)
    assert is_billing_staff(["practitioner"])
    assert is_billing_staff(["billing"])
    assert not is_billing_staff([])


def test_billing_processor_role(monkeypatch):
    monkeypatch.delenv("ENTRA_BILLING_PROCESSOR_APP_ROLE", raising=False)
    assert is_billing_processor(["billing"])
    assert not is_billing_processor(["practitioner"])


def test_can_view_billing_union(monkeypatch):
    monkeypatch.delenv("ENTRA_BILLING_STAFF_APP_ROLE", raising=False)
    monkeypatch.delenv("ENTRA_BILLING_PROCESSOR_APP_ROLE", raising=False)
    assert can_view_billing(["practitioner"])
    assert can_view_billing(["billing"])
    assert not can_view_billing([])


def test_billing_flags_from_roles(monkeypatch):
    monkeypatch.setenv("ENTRA_BILLING_STAFF_APP_ROLE", "staff")
    monkeypatch.setenv("ENTRA_BILLING_PROCESSOR_APP_ROLE", "processor")
    assert billing_flags_from_roles(["staff", "processor"]) == (True, True)
    assert billing_flags_from_roles(["staff"]) == (True, False)
    assert billing_flags_from_roles(["processor"]) == (True, True)
    assert billing_staff_role() == "staff"
    assert billing_processor_role() == "processor"
