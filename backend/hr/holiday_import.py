"""Suggests public holidays for a country/year using the `holidays` PyPI
library (local computation, no network call, no API key) so HR can
bulk-import a country's bank holidays instead of typing each one in by hand.
Covers 140+ countries/territories, including Pakistan/India/Bangladesh,
which the previous Nager.Date-backed implementation did not.
"""

import holidays


class UnsupportedCountry(Exception):
    """Raised when `country_code` isn't recognized by the `holidays` library."""


class HolidayLookupError(Exception):
    """Raised on any other failure while computing holidays (bad year, library bug, etc.)."""


def fetch_public_holidays(country_code, year):
    """Returns [{name, date, is_recurring}, ...] for the given ISO-3166
    country code and year. Raises `UnsupportedCountry` if the library doesn't
    recognize the code, or `HolidayLookupError` for any other failure — the
    caller (the view) turns both into a clean 400 rather than a 500.

    `is_recurring` is derived (not provided by the library) by checking
    whether a same-named holiday falls on the same month/day the following
    year — true for fixed civil holidays, false for lunar/Easter-based ones
    that shift date each year.
    """
    try:
        this_year = holidays.country_holidays(country_code, years=year)
        next_year = holidays.country_holidays(country_code, years=year + 1)
    except NotImplementedError:
        raise UnsupportedCountry(country_code)
    except Exception as exc:
        raise HolidayLookupError(str(exc)) from exc

    next_year_month_days_by_name = {}
    for d, name in next_year.items():
        next_year_month_days_by_name.setdefault(name, set()).add((d.month, d.day))

    results = []
    for d, name in sorted(this_year.items()):
        is_recurring = (d.month, d.day) in next_year_month_days_by_name.get(name, set())
        results.append({"name": name, "date": d.isoformat(), "is_recurring": is_recurring})
    return results


# Curated picker list for the frontend's country dropdown. The `holidays`
# library itself recognizes 140+ ISO-3166 codes — this is not that list, it's
# the subset this product's customer base actually needs, kept in one place
# so the frontend never hand-duplicates it.
COMMON_COUNTRIES = [
    # South Asia
    ("PK", "Pakistan"), ("IN", "India"), ("BD", "Bangladesh"), ("LK", "Sri Lanka"), ("NP", "Nepal"),
    # Middle East / GCC
    ("SA", "Saudi Arabia"), ("AE", "United Arab Emirates"), ("BH", "Bahrain"), ("KW", "Kuwait"),
    ("QA", "Qatar"), ("OM", "Oman"), ("JO", "Jordan"), ("EG", "Egypt"),
    # East / Southeast Asia
    ("CN", "China"), ("JP", "Japan"), ("KR", "South Korea"), ("SG", "Singapore"),
    ("MY", "Malaysia"), ("ID", "Indonesia"), ("PH", "Philippines"), ("VN", "Vietnam"), ("TH", "Thailand"),
    # Europe
    ("GB", "United Kingdom"), ("IE", "Ireland"), ("DE", "Germany"), ("FR", "France"),
    ("ES", "Spain"), ("IT", "Italy"), ("NL", "Netherlands"), ("BE", "Belgium"),
    ("CH", "Switzerland"), ("SE", "Sweden"), ("NO", "Norway"), ("DK", "Denmark"),
    ("FI", "Finland"), ("PL", "Poland"), ("PT", "Portugal"), ("AT", "Austria"),
    # Americas
    ("US", "United States"), ("CA", "Canada"), ("MX", "Mexico"), ("BR", "Brazil"), ("AR", "Argentina"),
    # Oceania / Africa
    ("AU", "Australia"), ("NZ", "New Zealand"), ("ZA", "South Africa"), ("NG", "Nigeria"), ("KE", "Kenya"),
]
