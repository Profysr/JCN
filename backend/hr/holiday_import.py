"""Fetches public-holiday suggestions from the Nager.Date API (date.nager.at)
so HR can bulk-import a country's bank holidays instead of typing each one in
by hand. Free, keyless, ~100 countries. This is a convenience feed only —
never something leave/attendance math depends on, so any upstream failure
degrades to an empty suggestion list rather than an error.
"""

import requests

NAGER_BASE_URL = "https://date.nager.at/api/v3/PublicHolidays"


def fetch_public_holidays(country_code, year):
    """Returns [{name, date, is_recurring}, ...] for the given ISO-3166 country
    code and year, or [] on any upstream/network failure. Nager's `fixed` flag
    (same month/day every year) maps directly onto our `is_recurring`."""
    try:
        resp = requests.get(f"{NAGER_BASE_URL}/{year}/{country_code}", timeout=5)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return []

    return [
        {
            "name": item.get("localName") or item.get("name"),
            "date": item.get("date"),
            "is_recurring": bool(item.get("fixed")),
        }
        for item in data
        if item.get("date") and (item.get("localName") or item.get("name"))
    ]
