"""
Maps source identifiers to their parser modules.
"""
from . import jira, trello, csv_parser

SUPPORTED_SOURCES = {
    "jira":    {"label": "Jira",          "format": "xml",  "module": jira},
    "trello":  {"label": "Trello",         "format": "json", "module": trello},
    "clickup": {"label": "ClickUp",        "format": "csv",  "module": csv_parser},
    "asana":   {"label": "Asana",          "format": "csv",  "module": csv_parser},
    "github":  {"label": "GitHub Issues",  "format": "csv",  "module": csv_parser},
    "linear":  {"label": "Linear",         "format": "csv",  "module": csv_parser},
    "notion":  {"label": "Notion",         "format": "csv",  "module": csv_parser},
    "monday":  {"label": "Monday",         "format": "csv",  "module": csv_parser},
    "csv":     {"label": "Generic CSV",    "format": "csv",  "module": csv_parser},
}


def get_parser(source: str):
    """Return the parser module for a given source key, or None."""
    entry = SUPPORTED_SOURCES.get(source)
    return entry["module"] if entry else None
