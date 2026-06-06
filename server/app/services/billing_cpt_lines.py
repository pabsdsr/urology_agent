"""Parse and validate CPT code lines with per-code modifiers."""
import json
import re
from typing import Any

from fastapi import HTTPException


def _split_billing_codes(raw: str) -> list[str]:
    return [part.strip() for part in re.split(r"[,;]+", raw or "") if part.strip()]


def validate_cpt_code(code: str) -> bool:
    normalized = code.strip().upper()
    return normalized[:-1].isdigit() and len(normalized) in {5, 6} if normalized else False


def validate_cpt_modifier(code: str) -> bool:
    normalized = code.strip().upper().lstrip("-")
    return len(normalized) == 2 and normalized.isalnum()


def normalize_modifier(code: str) -> str:
    return code.strip().upper().lstrip("-")


def normalize_cpt_line(line: dict[str, Any]) -> dict[str, Any]:
    code = str(line.get("code") or "").strip().upper()
    modifiers: list[str] = []
    raw_mods = line.get("modifiers")
    if isinstance(raw_mods, list):
        for item in raw_mods:
            mod = normalize_modifier(str(item))
            if mod and mod not in modifiers:
                modifiers.append(mod)
    elif isinstance(raw_mods, str):
        for part in _split_billing_codes(raw_mods):
            mod = normalize_modifier(part)
            if mod and mod not in modifiers:
                modifiers.append(mod)
    return {"code": code, "modifiers": modifiers}


def cpt_lines_from_legacy(cpt_code: str, cpt_modifiers: str = "") -> list[dict[str, Any]]:
    codes = [c.upper() for c in _split_billing_codes(cpt_code)]
    mods = [normalize_modifier(m) for m in _split_billing_codes(cpt_modifiers)]
    mods = [m for m in mods if m]
    if not codes:
        return []
    lines = []
    for index, code in enumerate(codes):
        lines.append({"code": code, "modifiers": mods if index == 0 else []})
    return lines


def derive_legacy_cpt_fields(cpt_lines: list[dict[str, Any]]) -> tuple[str, str]:
    codes = [line["code"] for line in cpt_lines if line.get("code")]
    all_modifiers: list[str] = []
    for line in cpt_lines:
        for mod in line.get("modifiers") or []:
            if mod not in all_modifiers:
                all_modifiers.append(mod)
    return ", ".join(codes), ", ".join(all_modifiers)


def parse_cpt_lines_json(
    cpt_lines_raw: str,
    *,
    cpt_code: str = "",
    cpt_modifiers: str = "",
) -> list[dict[str, Any]]:
    if cpt_lines_raw and cpt_lines_raw.strip():
        try:
            parsed = json.loads(cpt_lines_raw)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid CPT lines payload.") from exc
        if not isinstance(parsed, list):
            raise HTTPException(status_code=400, detail="CPT lines must be a JSON array.")
        normalized = [normalize_cpt_line(item) for item in parsed if isinstance(item, dict)]
        return [line for line in normalized if line["code"]]

    return cpt_lines_from_legacy(cpt_code, cpt_modifiers)


def validate_cpt_lines(cpt_lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not cpt_lines:
        raise HTTPException(status_code=400, detail="At least one CPT code is required.")

    validated: list[dict[str, Any]] = []
    for line in cpt_lines:
        code = line.get("code") or ""
        if not validate_cpt_code(code):
            raise HTTPException(status_code=400, detail=f"Invalid CPT code format: {code}")
        modifiers: list[str] = []
        for mod in line.get("modifiers") or []:
            if not validate_cpt_modifier(mod):
                raise HTTPException(status_code=400, detail=f"Invalid CPT modifier format: {mod}")
            normalized = normalize_modifier(mod)
            if normalized not in modifiers:
                modifiers.append(normalized)
        validated.append({"code": code.upper(), "modifiers": modifiers})
    return validated


def ensure_entry_cpt_lines(entry: dict[str, Any]) -> dict[str, Any]:
    """Populate ``cpt_lines`` on an index row for API responses."""
    result = dict(entry)
    existing = result.get("cpt_lines")
    if isinstance(existing, list) and existing:
        result["cpt_lines"] = [normalize_cpt_line(line) for line in existing if isinstance(line, dict)]
        return result
    result["cpt_lines"] = cpt_lines_from_legacy(
        str(result.get("cpt_code") or ""),
        str(result.get("cpt_modifiers") or ""),
    )
    return result
