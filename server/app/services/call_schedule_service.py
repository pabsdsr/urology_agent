import json
import os
from datetime import datetime, timedelta
from typing import Dict, Any

CALL_SCHEDULE_PATH = os.path.join(
    os.path.dirname(__file__),
    "..",
    "data",
    "call_schedule.json",
)


def _ensure_dir():
    directory = os.path.dirname(CALL_SCHEDULE_PATH)
    os.makedirs(directory, exist_ok=True)


def _load_call_schedule() -> Dict[str, Dict[str, str]]:
    """Load call schedule from disk. Keys are YYYY-MM-DD strings."""
    if not os.path.exists(CALL_SCHEDULE_PATH):
        return {}
    try:
        with open(CALL_SCHEDULE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Ensure structure is dict[str, dict[str, str]]
        return {str(k): dict(v) for k, v in data.items()}
    except Exception:
        # If the file is corrupted, fail soft and start empty rather than crashing the API.
        return {}


def _save_call_schedule(data: Dict[str, Dict[str, str]]) -> None:
    _ensure_dir()
    with open(CALL_SCHEDULE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, sort_keys=True)


def update_week(week_start: str, days: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Update (or create) call schedule entries for a single week.

    week_start: ISO date string (YYYY-MM-DD) for Monday of the week.
    days: mapping of date string -> { "North pod": name, "Central pod": name, "South pod": name }.
    """
    schedule = _load_call_schedule()
    for date_str, pods in days.items():
        # Normalize date key
        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d").date()
            norm_key = dt.strftime("%Y-%m-%d")
        except ValueError:
            # Skip invalid dates rather than erroring out the whole request
            continue
        schedule[norm_key] = pods
    _save_call_schedule(schedule)
    return schedule


def get_call_schedule_range(start_date: str, end_date: str) -> Dict[str, Dict[str, Any]]:
    """
    Return call schedule entries for an inclusive date range.
    Keys are YYYY-MM-DD strings between start_date and end_date.
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d").date()
        end_dt = datetime.strptime(end_date, "%Y-%m-%d").date()
    except ValueError:
        return {}

    raw = _load_call_schedule()
    result: Dict[str, Dict[str, str]] = {}
    cur = start_dt
    while cur <= end_dt:
        key = cur.strftime("%Y-%m-%d")
        if key in raw:
            result[key] = raw[key]
        cur += timedelta(days=1)
    return result


