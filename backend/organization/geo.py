"""Parses lat/lng out of the Google Maps links users actually paste, so
attendance geofencing (hr.models.Attendance) has a coordinate pair to check
against.

Handles both full URLs and shortened share links. Mobile "Share" links
(maps.app.goo.gl/..., goo.gl/maps/...) don't carry coordinates directly — they
redirect to a full URL that does — so short links are resolved first.
"""

import re

import requests

_COORD_PATTERNS = [
    re.compile(r"[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)"),
    re.compile(r"/@(-?\d+\.\d+),(-?\d+\.\d+)"),
    re.compile(r"/place/(-?\d+\.\d+),(-?\d+\.\d+)"),
]

_SHORT_LINK_HOSTS = ("goo.gl", "maps.app.goo.gl")


def _extract_coords(url):
    for pattern in _COORD_PATTERNS:
        match = pattern.search(url)
        if match:
            lat, lng = match.group(1), match.group(2)
            if -90 <= float(lat) <= 90 and -180 <= float(lng) <= 180:
                return lat, lng
    return None


def parse_maps_url(url, timeout=5):
    """Return (lat, lng) as strings, or None if the URL doesn't match a known
    Google Maps link format (including after resolving a short link)."""
    coords = _extract_coords(url)
    if coords:
        return coords

    if any(host in url for host in _SHORT_LINK_HOSTS):
        try:
            resp = requests.head(url, allow_redirects=True, timeout=timeout)
            return _extract_coords(resp.url)
        except requests.RequestException:
            return None

    return None
