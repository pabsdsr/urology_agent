"""
Background ModMed FHIR Patient/{id} fetch to refresh DynamoDB name cache.
Uses bounded concurrency (PATIENT_CACHE_REFRESH_CONCURRENCY, default 3).
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Dict, List

import httpx

from app.services.patient_name_cache_store import put_patient_name

PATIENT_CACHE_REFRESH_CONCURRENCY = int(
    os.getenv("PATIENT_CACHE_REFRESH_CONCURRENCY", "3")
)


def _display_name(given: str, family: str) -> str:
    """Build a UI-friendly display name from given/family parts."""
    g = (given or "").strip()
    f = (family or "").strip()
    if g and f:
        return f"{g} {f}".strip()
    return f or g


async def _fetch_one_patient(
    client: httpx.AsyncClient,
    base_url: str,
    headers: Dict[str, str],
    practice_url: str,
    patient_id: str,
    sem: asyncio.Semaphore,
    log: logging.Logger,
) -> None:
    """Fetch one Patient resource and write latest names to Dynamo cache."""
    url = f"{base_url.rstrip('/')}/Patient/{patient_id}"
    async with sem:
        try:
            r = await client.get(url, headers=headers, timeout=30.0)
            if r.status_code != 200:
                log.debug(
                    "Patient %s FHIR status %s",
                    patient_id,
                    r.status_code,
                )
                return
            resource = r.json()
            name = (resource.get("name") or [{}])[0]
            family = str(name.get("family") or "").strip()
            given_list = name.get("given") or []
            given = str(given_list[0]).strip() if given_list else ""
            display = _display_name(given, family)
            # put_patient_name is sync boto; run in thread to avoid blocking loop
            await asyncio.to_thread(
                put_patient_name,
                practice_url,
                patient_id,
                given,
                family,
                display,
            )
        except Exception as e:
            log.debug("Patient %s refresh failed: %s", patient_id, e)


async def refresh_patient_names_background(
    practice_url: str,
    base_url: str,
    patient_ids: List[str],
    modmed_token: str,
    practice_api_key: str,
    log: logging.Logger,
) -> None:
    """Refresh a set of patient names concurrently via ModMed FHIR."""
    if not patient_ids or not modmed_token or not practice_api_key:
        return
    headers = {
        "x-api-key": practice_api_key,
        "Authorization": f"Bearer {modmed_token}",
    }
    sem = asyncio.Semaphore(PATIENT_CACHE_REFRESH_CONCURRENCY)
    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            *[
                _fetch_one_patient(
                    client,
                    base_url,
                    headers,
                    practice_url,
                    pid,
                    sem,
                    log,
                )
                for pid in patient_ids
            ]
        )


def schedule_patient_name_refresh(
    practice_url: str,
    base_url: str,
    patient_ids: List[str],
    modmed_token: str,
    practice_api_key: str,
    log: logging.Logger,
) -> None:
    """Fire-and-forget background refresh (stale-while-revalidate)."""
    if not patient_ids:
        return
    def _log_task_failure(t: asyncio.Task) -> None:
        try:
            exc = t.exception()
        except asyncio.CancelledError:
            return
        if exc:
            log.warning("Patient cache refresh task failed: %s", exc)

    task = asyncio.create_task(
        refresh_patient_names_background(
            practice_url,
            base_url,
            patient_ids,
            modmed_token,
            practice_api_key,
            log,
        )
    )
    task.add_done_callback(_log_task_failure)
