#!/usr/bin/env python3
"""
One-time (or occasional) job: list all Patient resources for a firm via FHIR,
then write display names into the DynamoDB patient name cache.

Run from the server directory so imports and .env resolve:

  cd server && uv run python scripts/populate_patient_name_cache.py --practice ocua

Credentials (pick one):

  1) Env PRACTICE_<practice>=username,password,api_key — use --practice <practice>
     (same format as the main app).

  2) Explicit: --practice-url <firm prefix> --modmed-token <bearer> --api-key <x-api-key>

Requires AWS credentials / region for PATIENT_CACHE_* DynamoDB (same as the app).

Options:
  --dry-run   Fetch and count patients only; no DynamoDB writes.
  --max-pages Cap pagination (default 5000 pages ~= 250k patients at _count=50).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse

import httpx
from dotenv import load_dotenv

# Server package root (parent of scripts/)
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

load_dotenv(_ROOT / ".env")

from app.services.patient_name_cache_store import (  # noqa: E402
    patient_cache_writes_enabled,
    put_patient_name,
)

log = logging.getLogger("populate_patient_name_cache")

FHIR_BASE = "https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/fhir/v2"


def _display_name(given: str, family: str) -> str:
    g = (given or "").strip()
    f = (family or "").strip()
    if g and f:
        return f"{g} {f}".strip()
    return f or g


def _parse_patient_resource(res: Dict[str, Any]) -> Optional[Tuple[str, str, str, str]]:
    if res.get("resourceType") != "Patient":
        return None
    pid = str(res.get("id") or "").strip()
    if not pid:
        return None
    name = (res.get("name") or [{}])[0]
    family = str(name.get("family") or "").strip()
    given_list = name.get("given") or []
    given = str(given_list[0]).strip() if given_list else ""
    display = _display_name(given, family)
    return pid, given, family, display


async def _modmed_password_token(
    practice_url: str, username: str, password: str, api_key: str
) -> Optional[str]:
    headers = {
        "x-api-key": api_key,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    data = {
        "grant_type": "password",
        "username": username,
        "password": password,
    }
    oauth_url = (
        f"https://mmapi.ema-api.com/ema-prod/firm/{practice_url}/ema/ws/oauth2/grant"
    )
    timeout = httpx.Timeout(30.0, connect=10.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(oauth_url, headers=headers, data=data)
        if r.status_code != 200:
            log.error(
                "ModMed OAuth failed: %s %s",
                r.status_code,
                (r.text or "")[:300],
            )
            return None
        body = r.json()
        tok = body.get("access_token")
        return str(tok).strip() if tok else None


def _credentials_from_practice_env(practice_key: str) -> Optional[Tuple[str, str, str, str]]:
    """
    PRACTICE_<key>=username,password,api_key -> (username, password, practice_url, api_key)
    practice_url is the same as the env key (firm prefix).
    """
    env_key = f"PRACTICE_{practice_key.strip()}"
    value = os.getenv(env_key)
    if not value:
        log.error("Missing env %s (expected username,password,api_key)", env_key)
        return None
    parts = value.split(",")
    if len(parts) != 3:
        log.error("Env %s must be exactly username,password,api_key", env_key)
        return None
    username, password, api_key = (p.strip() for p in parts)
    practice_url = practice_key.strip()
    return username, password, practice_url, api_key


async def fetch_all_patients_bundle(
    base_url: str,
    headers: Dict[str, str],
    max_pages: int,
    start_page: Optional[int],
    max_retries: int,
    retry_backoff_seconds: float,
    dry_run: bool,
    practice_url: str,
) -> List[Tuple[str, str, str, str]]:
    """Paginate GET Patient; return list for dry-run, else write each page as fetched."""
    url = f"{base_url.rstrip('/')}/Patient"
    out: List[Tuple[str, str, str, str]] = []
    next_page: Optional[int] = start_page
    pages = 0
    parsed_total = 0
    written_total = 0
    timeout = httpx.Timeout(60.0, connect=15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            pages += 1
            if pages > max_pages:
                log.warning("Stopped at max-pages=%s", max_pages)
                break
            params = [("_count", "50")]
            if next_page is not None:
                params.append(("page", str(next_page)))
            r = None
            for attempt in range(max_retries + 1):
                try:
                    r = await client.get(url, params=params, headers=headers)
                    break
                except (httpx.ReadError, httpx.ReadTimeout, httpx.ConnectError) as e:
                    if attempt >= max_retries:
                        log.error("GET Patient failed after retries on params=%s: %s", params, e)
                        raise
                    sleep_s = retry_backoff_seconds * (2 ** attempt)
                    log.warning(
                        "Transient HTTP error for params=%s (attempt %s/%s): %s; retrying in %.1fs",
                        params,
                        attempt + 1,
                        max_retries + 1,
                        e,
                        sleep_s,
                    )
                    await asyncio.sleep(sleep_s)
            if r is None:
                raise SystemExit(1)
            if r.status_code != 200:
                log.error(
                    "GET Patient failed: %s %s",
                    r.status_code,
                    (r.text or "")[:500],
                )
                raise SystemExit(1)
            data = r.json()
            for entry in data.get("entry") or []:
                res = entry.get("resource") or {}
                parsed = _parse_patient_resource(res)
                if parsed:
                    parsed_total += 1
                    if dry_run:
                        out.append(parsed)
                    else:
                        pid, given, family, display = parsed
                        put_patient_name(practice_url, pid, given, family, display)
                        written_total += 1
                        if written_total % 500 == 0:
                            log.info("Wrote %s cache items so far", written_total)
            if pages % 25 == 0:
                log.info(
                    "Progress: pages=%s parsed=%s written=%s",
                    pages,
                    parsed_total,
                    written_total,
                )
            next_page = None
            for link in data.get("link") or []:
                if link.get("relation") == "next":
                    next_link_url = link.get("url") or ""
                    if "page=" in next_link_url:
                        try:
                            parsed_url = urlparse(next_link_url)
                            qs = parse_qs(parsed_url.query)
                            pages_q = qs.get("page", [])
                            if pages_q:
                                next_page = int(pages_q[0])
                        except (ValueError, IndexError, KeyError):
                            pass
                    break
            if next_page is None:
                break
    log.info("Fetch complete: pages=%s parsed=%s written=%s", pages, parsed_total, written_total)
    return out


async def main_async() -> None:
    parser = argparse.ArgumentParser(
        description="Populate DynamoDB patient name cache from ModMed FHIR Patient list."
    )
    parser.add_argument(
        "--practice",
        metavar="KEY",
        help="Firm prefix; reads PRACTICE_<KEY>=user,pass,api_key and OAuth password grant",
    )
    parser.add_argument(
        "--practice-url",
        help="Firm prefix (if not using --practice env credentials)",
    )
    parser.add_argument("--modmed-token", help="Bearer token (alternative to --practice env)")
    parser.add_argument("--api-key", help="x-api-key (with --modmed-token)")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only list patients; do not write DynamoDB",
    )
    parser.add_argument(
        "--max-pages",
        type=int,
        default=5000,
        help="Safety cap on FHIR list pages (default 5000)",
    )
    parser.add_argument(
        "--start-page",
        type=int,
        default=None,
        help="Start from a specific FHIR page (resume support).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=5,
        help="Retries for transient HTTP errors per page (default 5).",
    )
    parser.add_argument(
        "--retry-backoff-seconds",
        type=float,
        default=1.0,
        help="Base backoff seconds for retries (default 1.0).",
    )
    args = parser.parse_args()

    practice_url: str
    token: str
    api_key: str

    if args.practice:
        creds = _credentials_from_practice_env(args.practice)
        if not creds:
            raise SystemExit(1)
        u, p, practice_url, api_key = creds
        token_t = await _modmed_password_token(practice_url, u, p, api_key)
        if not token_t:
            raise SystemExit(1)
        token = token_t
    elif args.practice_url and args.modmed_token and args.api_key:
        practice_url = args.practice_url.strip()
        token = args.modmed_token.strip()
        api_key = args.api_key.strip()
    else:
        parser.error(
            "Either --practice KEY (with PRACTICE_KEY=...) or "
            "--practice-url + --modmed-token + --api-key"
        )

    base = FHIR_BASE.format(practice_url=practice_url)
    headers = {
        "Authorization": f"Bearer {token}",
        "x-api-key": api_key,
    }

    if not args.dry_run and not patient_cache_writes_enabled():
        log.error(
            "DynamoDB patient cache is not available (check PATIENT_CACHE_* and AWS credentials)."
        )
        raise SystemExit(1)

    log.info(
        "Fetching Patient bundle pages from %s/Patient ... (start_page=%s, dry_run=%s)",
        base,
        args.start_page,
        args.dry_run,
    )
    rows = await fetch_all_patients_bundle(
        base,
        headers,
        args.max_pages,
        args.start_page,
        args.max_retries,
        args.retry_backoff_seconds,
        args.dry_run,
        practice_url,
    )
    if args.dry_run:
        log.info("Dry run complete. Parsed %s patient rows from FHIR.", len(rows))
    else:
        log.info("Done writing patient cache for practice_url=%s", practice_url)


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
