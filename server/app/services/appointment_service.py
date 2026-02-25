from collections import defaultdict
from datetime import datetime, timedelta
import pytz
import logging

# Column key used when appointment is classified as surgery (shown as its own column)
SURGERY_COLUMN_KEY = "Surgery"

# Appointment type IDs that count as surgery (ModMed appointmentType.coding[0].code in FHIR).
SURGERY_APPOINTMENT_TYPE_IDS = ("9449",)

def _is_surgery_appointment(appt: dict) -> bool:
    appt_type_id = appt.get("appointment_type")
    if not appt_type_id:
        return False
    return str(appt_type_id).strip() in SURGERY_APPOINTMENT_TYPE_IDS


def get_appointment_type_id_to_name(appointments: list) -> dict:
    """Build a map of appointment type ID -> display name from a list of appointments."""
    result = {}
    for a in appointments:
        tid = a.get("appointment_type")
        display = (a.get("appointment_type_display") or "").strip()
        if tid is not None and str(tid).strip():
            tid = str(tid).strip()
            if tid not in result:
                result[tid] = display or "(no display)"
    return result


def get_surgery_location_ids(appointments: list) -> list:
    """Return sorted list of distinct location IDs seen on appointments classified as surgery."""
    ids = set()
    for a in appointments:
        if _is_surgery_appointment(a):
            for loc_id in a.get("location_ids") or []:
                if loc_id:
                    ids.add(str(loc_id).strip())
    return sorted(ids)


def aggregate_practitioner_schedule(appointments: list) -> dict:
    """
    Aggregate appointments into a schedule by location, AM/PM, and practitioner.
    Surgery appointments use a dedicated column (SURGERY_COLUMN_KEY). Other appointments use location_id.
    Returns: {date: {practitioner: {AM: {location_or_Surgery: time}, PM: {...}}}}
    """
    schedule = defaultdict(lambda: defaultdict(lambda: {"AM": {}, "PM": {}}))
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        from backports.zoneinfo import ZoneInfo  # For Python <3.9
    pacific = ZoneInfo("America/Los_Angeles")

    for appt in appointments:
        start_str = appt.get("start")
        if not start_str:
            continue
        try:
            dt = datetime.fromisoformat(start_str)
            # If dt is naive, assume UTC
            if dt.tzinfo is None:
                from datetime import timezone
                dt = dt.replace(tzinfo=timezone.utc)
            pacific_dt = dt.astimezone(pacific)
        except Exception:
            continue
        hour = pacific_dt.hour
        ampm = "AM" if hour < 12 else "PM"
        date_str = pacific_dt.strftime("%Y-%m-%d")
        practitioner = (appt.get("practitioner_ids") or ["Unknown"])[0]
        loc_key = SURGERY_COLUMN_KEY if _is_surgery_appointment(appt) else (appt.get("location_ids") or ["Unknown"])[0]
        time_str = pacific_dt.strftime("%I:%M").lstrip("0")
        loc_times = schedule[date_str][practitioner][ampm]
        if loc_key not in loc_times or pacific_dt.time() < datetime.strptime(loc_times[loc_key], "%H:%M").time():
            loc_times[loc_key] = time_str
    # Convert defaultdicts to dicts
    return {date: {prac: {block: dict(locs) for block, locs in blocks.items()} for prac, blocks in prac_map.items()} for date, prac_map in schedule.items()}

import os
import asyncio
import time
from urllib.parse import parse_qs, urlparse

# Rate limiter (max concurrent requests)
# Concurrency can be tuned via MODMED_MAX_CONCURRENT_REQUESTS; default 3 is conservative to avoid 429s/timeouts.
MAX_CONCURRENT_REQUESTS = int(os.getenv("MODMED_MAX_CONCURRENT_REQUESTS", 3))
semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

# Cache for practitioner and location id→name and practitioner role (per base_url). Refreshed every PRACTITIONER_LOCATION_CACHE_TTL seconds.
PRACTITIONER_LOCATION_CACHE_TTL = int(os.getenv("PRACTITIONER_LOCATION_CACHE_TTL", 3600))  # 1 hour default
_practitioner_location_cache: dict = {}  # base_url -> { "practitioner_names": {}, "location_names": {}, "practitioner_roles": {}, "practitioner_types": {}, "cached_at": float }

# Cache for aggregated schedule/appointments, keyed by base_url and anchored week window.
# Each entry: {
#   "window_start": "YYYY-MM-DD",
#   "window_end": "YYYY-MM-DD",
#   "appointments": List[dict],
#   "schedule": Dict[str, ...],
#   "cached_at": float,
# }
SCHEDULE_CACHE_WEEKS = int(os.getenv("SCHEDULE_CACHE_WEEKS", 4))
SCHEDULE_CACHE_TTL = int(os.getenv("SCHEDULE_CACHE_TTL", 900))  # 15 minutes default
_schedule_cache: dict = {}  # base_url -> cache_entry

from typing import List, Tuple, Dict
from app.services.client_service import client


async def _prewarm_schedule_cache(base_url: str, modmed_token: str, practice_api_key: str, window_start: str, window_end: str, logger):
    """Warm the 3‑week schedule cache in the background without blocking responses."""
    try:
        appointments_all = await get_appointments_by_date(window_start, window_end, modmed_token, base_url, practice_api_key)
        schedule_all = aggregate_practitioner_schedule(appointments_all)
        _schedule_cache[base_url] = {
            "window_start": window_start,
            "window_end": window_end,
            "appointments": appointments_all,
            "schedule": schedule_all,
            "cached_at": time.monotonic(),
        }
    except Exception as e:
        logger.warning(f"[Schedule cache] Failed to warm window {window_start} to {window_end}: {e}")


def _parse_practitioner_name(resource: dict) -> str:
    """Extract display name from FHIR Practitioner resource."""
    names = resource.get("name") or []
    if not names:
        return ""
    name = names[0] if isinstance(names[0], dict) else {}
    if name.get("text"):
        return name["text"].strip()
    given = name.get("given") or []
    family = (name.get("family") or "").strip()
    given_str = " ".join(g for g in given if isinstance(g, str)).strip()
    return f"{given_str} {family}".strip() or ""


def _parse_location_name(resource: dict) -> str:
    """Extract display name from FHIR Location resource."""
    name = resource.get("name")
    if name is None:
        return ""
    return str(name).strip() if name else ""


def _canonical_practitioner_id(pid: str) -> str:
    """Normalize practitioner id so schedule (from appointments) and types/names (from list) match. ModMed may use 'ref|21974' in one place and '21974' in another."""
    if not pid:
        return pid
    s = str(pid).strip()
    if s.startswith("ref|"):
        return s[4:]
    return s


async def _fetch_all_practitioners(base_url: str, headers: dict, logger) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str]]:
    """GET list of practitioners; return (id→name, id→role, id→type). Keys are canonical ids. Role/type are empty until hardcoded."""
    url = f"{base_url}/Practitioner"
    names: Dict[str, str] = {}
    roles: Dict[str, str] = {}
    types: Dict[str, str] = {}
    next_page = None
    request_count = 0
    while True:
        request_count += 1
        params = [("_count", 50)]
        if next_page is not None:
            params.append(("page", str(next_page)))
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            logger.warning(f"[Practitioners] GET {url} returned {resp.status_code}. Skipping practitioner names.")
            return names, roles, types
        data = resp.json()
        for entry in data.get("entry") or []:
            res = entry.get("resource") or {}
            if res.get("resourceType") == "Practitioner":
                rid = res.get("id")
                if rid:
                    cid = _canonical_practitioner_id(rid)
                    names[cid] = _parse_practitioner_name(res)
        next_page = None
        for link in data.get("link") or []:
            if link.get("relation") == "next":
                next_link_url = link.get("url") or ""
                if "page=" in next_link_url:
                    try:
                        parsed = urlparse(next_link_url)
                        qs = parse_qs(parsed.query)
                        pages = qs.get("page", [])
                        if pages:
                            next_page = int(pages[0])
                    except (ValueError, IndexError, KeyError):
                        pass
                break
        if next_page is None:
            break
    return names, roles, types


async def _fetch_all_locations(base_url: str, headers: dict, logger) -> Dict[str, str]:
    """GET list of locations for the firm; paginate and return id→name."""
    url = f"{base_url}/Location"
    result = {}
    next_page = None
    request_count = 0
    while True:
        request_count += 1
        params = [("_count", 50)]
        if next_page is not None:
            params.append(("page", str(next_page)))
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            logger.warning(f"[Locations] GET {url} returned {resp.status_code}. Skipping location names.")
            return result
        data = resp.json()
        for entry in data.get("entry") or []:
            res = entry.get("resource") or {}
            if res.get("resourceType") == "Location":
                rid = res.get("id")
                if rid:
                    result[rid] = _parse_location_name(res)
        next_page = None
        for link in data.get("link") or []:
            if link.get("relation") == "next":
                next_link_url = link.get("url") or ""
                if "page=" in next_link_url:
                    try:
                        parsed = urlparse(next_link_url)
                        qs = parse_qs(parsed.query)
                        pages = qs.get("page", [])
                        if pages:
                            next_page = int(pages[0])
                    except (ValueError, IndexError, KeyError):
                        pass
                break
        if next_page is None:
            break
    return result


async def get_practitioner_and_location_names(
    base_url: str, modmed_token: str, practice_api_key: str, logger
) -> Tuple[Dict[str, str], Dict[str, str], Dict[str, str], Dict[str, str]]:
    """Return (practitioner_names, location_names, practitioner_roles, practitioner_types). Types: physician|pa|np|other."""
    now = time.monotonic()
    entry = _practitioner_location_cache.get(base_url)
    if entry and (now - entry["cached_at"]) < PRACTITIONER_LOCATION_CACHE_TTL:
        return entry["practitioner_names"], entry["location_names"], entry["practitioner_roles"], entry["practitioner_types"]
    headers = {
        "Authorization": f"Bearer {modmed_token}",
        "x-api-key": practice_api_key,
    }
    (practitioner_names, practitioner_roles, practitioner_types), location_names = await asyncio.gather(
        _fetch_all_practitioners(base_url, headers, logger),
        _fetch_all_locations(base_url, headers, logger),
    )
    _practitioner_location_cache[base_url] = {
        "practitioner_names": practitioner_names,
        "location_names": location_names,
        "practitioner_roles": practitioner_roles,
        "practitioner_types": practitioner_types,
        "cached_at": now,
    }
    return practitioner_names, location_names, practitioner_roles, practitioner_types


async def fetch_appointments_for_range(start_dt: datetime, end_dt: datetime, modmed_token: str, base_url: str, practice_api_key: str, logger=logging):
    async with semaphore:
        url = f"{base_url}/Appointment"
        params = [
            ("date", f"ge{start_dt.strftime('%Y-%m-%dT%H:%M:%S.000Z')}"),
            ("date", f"le{end_dt.strftime('%Y-%m-%dT%H:%M:%S.999Z')}"),
            # No _include for Patient — schedule view only needs IDs and timing, which are on Appointment itself.
            ("_count", 50),  # Set to 50, the true max allowed
        ]
        headers = {
            "Authorization": f"Bearer {modmed_token}",
            "x-api-key": practice_api_key
        }
        appointments = []
        max_retries = 5
        retry_delay = 2
        request_count = 0
        next_page = None  # None = first page, then 2, 3, ...
        max_safety_pages = 1000  # Hard safety cap to prevent infinite loops
        seen_pages = set()
        last_appointment_keys = set()
        # Build params once; add page only when following pagination (httpx replaces query string when params= is passed, so we never use the "next" link URL)
        base_params = list(params)
        while True:
            request_count += 1
            if request_count > max_safety_pages:
                logger.warning(f"[Appointments] Exceeded hard safety cap of {max_safety_pages} pages for chunk {start_dt.date()} to {end_dt.date()}. Stopping pagination.")
                break
            local_params = base_params + ([("page", str(next_page))] if next_page is not None else [])
            if next_page is not None and next_page in seen_pages:
                logger.warning(f"[Appointments] page={next_page} already seen (pagination loop). Stopping pagination.")
                break
            if next_page is not None:
                seen_pages.add(next_page)
            for attempt in range(max_retries):
                try:
                    resp = await client.get(url, params=local_params, headers=headers)
                except Exception as e:
                    # Network-level error (including timeouts): retry with backoff, then fail with clear message.
                    if attempt < max_retries - 1:
                        logger.warning(f"[Appointments] Network error for {start_dt} to {end_dt} on attempt {attempt+1}: {e}. Retrying...")
                        await asyncio.sleep(retry_delay * (attempt + 1))
                        continue
                    raise Exception(f"ModMed FHIR API network error after {attempt+1} attempts for {start_dt} to {end_dt}: {e}")

                if resp.status_code == 429:
                    if attempt < max_retries - 1:
                        await asyncio.sleep(retry_delay * (attempt + 1))
                        continue
                    else:
                        try:
                            error_detail = resp.text
                        except Exception:
                            error_detail = "<no response body>"
                        logger.warning(f"[Appointments] 429 Too Many Requests for {start_dt} to {end_dt} after {attempt+1} attempts.")
                        raise Exception(f"ModMed FHIR API error: {resp.status_code} {resp.reason_phrase} - {error_detail}")
                elif resp.status_code != 200:
                    try:
                        error_detail = resp.text
                    except Exception:
                        error_detail = "<no response body>"
                    logger.warning(f"[Appointments] Non-200 ({resp.status_code}) for {start_dt} to {end_dt} after {attempt+1} attempts.")
                    raise Exception(f"ModMed FHIR API error: {resp.status_code} {resp.reason_phrase} - {error_detail}")
                else:
                    break
            try:
                data = resp.json()
            except Exception as e:
                raise Exception(f"Failed to parse ModMed FHIR API response as JSON: {e}\nResponse text: {resp.text}")
            entry = data.get("entry", [])
            # Detect if no new appointments are being returned (by unique start+patient_id)
            current_keys = set()
            page_starts = []  # For range check to stop pagination
            for appt in entry:
                resource = appt.get("resource", {})
                start = resource.get("start")
                patient_ref = next((p["actor"]["reference"].split("/")[-1] for p in resource.get("participant", []) if "/Patient/" in p["actor"]["reference"]), None)
                if start and patient_ref:
                    current_keys.add((start, patient_ref))
                    try:
                        dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=pytz.utc)
                        page_starts.append(dt)
                    except Exception:
                        pass
            if current_keys and current_keys.issubset(last_appointment_keys):
                logger.warning(f"[Appointments] No new appointments returned on this page (possible pagination loop). Stopping pagination.")
                break
            last_appointment_keys.update(current_keys)

            # Only include appointments whose start falls in [start_dt, end_dt] (API may ignore date filter or use different TZ)
            def start_in_range(start_iso):
                if not start_iso:
                    return False
                try:
                    dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=pytz.utc)
                    return start_dt <= dt <= end_dt
                except Exception:
                    return False

            for appt in entry:
                resource = appt.get("resource", {})
                start = resource.get("start")
                end = resource.get("end")
                if not start_in_range(start):
                    continue
                # Match full URLs for Practitioner, Location, Patient. Normalize practitioner id so it matches keys from Practitioner list/by-id.
                _raw_refs = [p["actor"]["reference"].split("/")[-1] for p in resource.get("participant", []) if "/Practitioner/" in p["actor"]["reference"]]
                practitioner_refs = [_canonical_practitioner_id(rid) for rid in _raw_refs]
                location_refs = [
                    p["actor"]["reference"].split("/")[-1]
                    for p in resource.get("participant", [])
                    if "/Location/" in p["actor"]["reference"]
                ]
                patient_ref = next(
                    (p["actor"]["reference"].split("/")[-1]
                     for p in resource.get("participant", [])
                     if "/Patient/" in p["actor"]["reference"]),
                    None
                )
                # Extract appointment type (code and display for surgery detection)
                appt_type = None
                appt_type_display = None
                appt_type_obj = resource.get("appointmentType")
                if appt_type_obj:
                    coding = appt_type_obj.get("coding", [])
                    if coding and isinstance(coding, list):
                        appt_type = coding[0].get("code")
                        appt_type_display = coding[0].get("display") or coding[0].get("text") or ""
                    appt_type_display = appt_type_display or appt_type_obj.get("text") or ""

                appointments.append({
                    "start": start,
                    "end": end,
                    "patient_id": patient_ref,
                    "practitioner_ids": practitioner_refs,
                    "location_ids": location_refs,
                    "appointment_type": appt_type,
                    "appointment_type_display": appt_type_display or "",
                })

            # Stop pagination if this page's appointments are all past our end_dt (avoids infinite loop when API ignores date filter)
            if page_starts and min(page_starts) > end_dt:
                break

            # Pagination: parse page number from "next" link so we keep our date params (httpx overwrites query when params= is used)
            next_page = None
            for link in data.get("link", []):
                if link.get("relation") == "next":
                    next_link_url = link.get("url") or ""
                    # Extract page=N from next link (e.g. "...&page=2" or "?page=2")
                    if "page=" in next_link_url:
                        try:
                            parsed = urlparse(next_link_url)
                            qs = parse_qs(parsed.query)
                            pages = qs.get("page", [])
                            if pages:
                                next_page = int(pages[0])
                        except (ValueError, IndexError, KeyError):
                            pass
                    break
            # If no appointments were included from this page, stop paginating
            if not entry and request_count == 1:
                break
            if next_page is None:
                break
        return appointments

async def get_appointments_by_date(start_date: str, end_date: str, modmed_token: str, base_url: str, practice_api_key: str) -> List[dict]:
    """Fetch appointments for an inclusive date range (Pacific), one day at a time."""
    # Parse input dates
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d")
    logger = logging.getLogger("app.services.appointment_service")
    pacific = pytz.timezone("US/Pacific")

    # Build one task per day in the range so each day is fully covered in Pacific time.
    tasks = []
    current = start_dt
    while current <= end_dt:
        pacific_start_dt = pacific.localize(datetime(current.year, current.month, current.day, 0, 0, 0))
        pacific_end_dt = pacific_start_dt + timedelta(days=1) - timedelta(seconds=1)
        utc_start_dt = pacific_start_dt.astimezone(pytz.utc)
        utc_end_dt = pacific_end_dt.astimezone(pytz.utc)
        tasks.append(
            fetch_appointments_for_range(utc_start_dt, utc_end_dt, modmed_token, base_url, practice_api_key, logger)
        )
        current += timedelta(days=1)

    results = await asyncio.gather(*tasks)
    # Flatten list of lists
    all_appointments = [appt for chunk_appts in results for appt in chunk_appts]
    # Deduplicate by (start, end, patient_id)
    unique = {}
    for appt in all_appointments:
        key = (appt["start"], appt["end"], appt["patient_id"])
        if key not in unique:
            unique[key] = appt
    deduped_appointments = list(unique.values())
    return deduped_appointments


async def get_practitioner_schedule_by_date(start_date: str, end_date: str, modmed_token: str, base_url: str, practice_api_key: str):
    """
    Returns practitioner schedule grid by date/location/AMPM/practitioner, plus id→name maps for practitioners and locations.
    """
    logger = logging.getLogger("app.services.appointment_service")
    pacific = pytz.timezone("US/Pacific")

    # Fixed cache window: 3 weeks starting from Monday of the *current* work week (Pacific).
    today_pacific = datetime.now(pacific).date()
    weekday = today_pacific.weekday()  # Monday=0
    current_monday = today_pacific - timedelta(days=weekday)
    window_start_dt = current_monday
    window_end_dt = current_monday + timedelta(weeks=SCHEDULE_CACHE_WEEKS) - timedelta(days=1)
    window_start = window_start_dt.strftime("%Y-%m-%d")
    window_end = window_end_dt.strftime("%Y-%m-%d")

    # Is the requested range inside the fixed cache window?
    request_in_window = window_start <= start_date <= end_date <= window_end

    if request_in_window:
        now = time.monotonic()
        cache_entry = _schedule_cache.get(base_url)
        cache_valid = (
            cache_entry
            and (now - cache_entry["cached_at"] < SCHEDULE_CACHE_TTL)
            and cache_entry["window_start"] == window_start
            and cache_entry["window_end"] == window_end
        )

        if cache_valid:
            # Serve entirely from warm cache.
            appointments_all = cache_entry["appointments"]
            schedule_all = cache_entry["schedule"]

            def in_range(date_str: str) -> bool:
                return start_date <= date_str <= end_date

            appointments = [
                a for a in appointments_all if "start" in a and in_range(a["start"][:10])
            ]
            schedule = {d: v for d, v in schedule_all.items() if in_range(d)}
        else:
            # Staged-load: fetch just the requested range for this response.
            appointments = await get_appointments_by_date(
                start_date, end_date, modmed_token, base_url, practice_api_key
            )
            schedule = aggregate_practitioner_schedule(appointments)

            # Warm the 3‑week cache window in the background (non-blocking).
            asyncio.create_task(
                _prewarm_schedule_cache(
                    base_url, modmed_token, practice_api_key, window_start, window_end, logger
                )
            )
    else:
        # Outside fixed cache window: fetch just the requested range, without touching the cache.
        appointments = await get_appointments_by_date(
            start_date, end_date, modmed_token, base_url, practice_api_key
        )
        schedule = aggregate_practitioner_schedule(appointments)

    (practitioner_names, location_names, practitioner_roles, practitioner_types) = await get_practitioner_and_location_names(
        base_url, modmed_token, practice_api_key, logger
    )

    surgery_loc_ids = get_surgery_location_ids(appointments)
    surgery_locations = [{"id": lid, "name": location_names.get(lid) or "(unknown)"} for lid in surgery_loc_ids]
    return {
        "schedule": schedule,
        "practitioner_names": practitioner_names,
        "practitioner_roles": practitioner_roles,
        "practitioner_types": practitioner_types,
        "location_names": location_names,
        "surgery_locations": surgery_locations,
    }
