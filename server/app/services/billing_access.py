"""Entra app role checks for billing submission and processing access."""
import os


def billing_staff_role() -> str:
    return (os.getenv("ENTRA_BILLING_STAFF_APP_ROLE") or "practitioner").strip()


def billing_processor_role() -> str:
    return (os.getenv("ENTRA_BILLING_PROCESSOR_APP_ROLE") or "billing").strip()


def billing_flags_from_roles(roles: list[str]) -> tuple[bool, bool]:
    role_set = set(roles or [])
    practitioner = billing_staff_role() in role_set
    billing = billing_processor_role() in role_set
    return practitioner or billing, billing


def is_billing_staff(roles: list[str]) -> bool:
    """Submit, edit, delete, and use billing code search."""
    return billing_flags_from_roles(roles)[0]


def is_billing_processor(roles: list[str]) -> bool:
    """Mark submissions as processed."""
    return billing_flags_from_roles(roles)[1]


def can_view_billing(roles: list[str]) -> bool:
    """View inbox and billing sheet images."""
    staff, processor = billing_flags_from_roles(roles)
    return staff or processor
