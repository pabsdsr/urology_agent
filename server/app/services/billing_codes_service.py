"""Curated urology CPT and ICD-10 codes for billing form search."""
import json
import os
from typing import Dict, List

_DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
_CPT_PATH = os.path.join(_DATA_DIR, "billing_cpt_codes.json")
_ICD10_PATH = os.path.join(_DATA_DIR, "billing_icd10_codes.json")
_MODIFIER_PATH = os.path.join(_DATA_DIR, "billing_cpt_modifiers.json")

_cpt_cache: List[Dict[str, str]] | None = None
_icd10_cache: List[Dict[str, str]] | None = None
_modifier_cache: List[Dict[str, str]] | None = None


def _load_codes(path: str) -> List[Dict[str, str]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        return []
    return [
        {"code": str(item["code"]).strip().upper(), "description": str(item["description"]).strip()}
        for item in data
        if isinstance(item, dict) and item.get("code") and item.get("description")
    ]


def _cpt_codes() -> List[Dict[str, str]]:
    global _cpt_cache
    if _cpt_cache is None:
        _cpt_cache = _load_codes(_CPT_PATH)
    return _cpt_cache


def _icd10_codes() -> List[Dict[str, str]]:
    global _icd10_cache
    if _icd10_cache is None:
        _icd10_cache = _load_codes(_ICD10_PATH)
    return _icd10_cache


def _cpt_modifiers() -> List[Dict[str, str]]:
    global _modifier_cache
    if _modifier_cache is None:
        _modifier_cache = _load_codes(_MODIFIER_PATH)
    return _modifier_cache


def search_codes(codes: List[Dict[str, str]], query: str, *, limit: int) -> List[Dict[str, str]]:
    q = (query or "").strip().lower()
    if not q:
        return codes[:limit]

    matches: List[Dict[str, str]] = []
    for item in codes:
        code = item["code"].lower()
        desc = item["description"].lower()
        if q in code or q in desc:
            matches.append(item)
        if len(matches) >= limit:
            break
    return matches


def search_cpt_codes(query: str = "", limit: int = 20) -> List[Dict[str, str]]:
    limit = max(1, min(limit, 50))
    return search_codes(_cpt_codes(), query, limit=limit)


def search_icd10_codes(query: str = "", limit: int = 20) -> List[Dict[str, str]]:
    limit = max(1, min(limit, 50))
    return search_codes(_icd10_codes(), query, limit=limit)


def search_cpt_modifiers(query: str = "", limit: int = 20) -> List[Dict[str, str]]:
    limit = max(1, min(limit, 50))
    return search_codes(_cpt_modifiers(), query, limit=limit)
