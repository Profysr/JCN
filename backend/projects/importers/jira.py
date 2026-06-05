"""
Jira XML export parser.
Supports the standard RSS export from Jira's Issue Navigator.
"""
import xml.etree.ElementTree as ET
from typing import List
from .base import ParsedTask, normalize_priority, normalize_type

# Default field auto-mapping for Jira exports
AUTO_MAPPING = {
    "summary":    "title",
    "description": "description",
    "status":     "status_name",
    "priority":   "priority",
    "type":       "task_type",
    "assignee":   "assignee_email",
    "due":        "due_date",
    "labels":     "labels",
    "key":        "external_id",
}


def parse(file_content: str) -> List[ParsedTask]:
    """Parse a Jira XML export and return a list of ParsedTask objects."""
    try:
        root = ET.fromstring(file_content)
    except ET.ParseError as exc:
        raise ValueError(f"Invalid Jira XML: {exc}")

    tasks = []
    # Jira XML: <rss><channel><item>...</item></channel></rss>
    items = root.findall(".//item")
    if not items:
        raise ValueError("No <item> elements found — is this a Jira RSS export?")

    for item in items:
        def text(tag, default=""):
            el = item.find(tag)
            return (el.text or default).strip() if el is not None else default

        # Title: "[KEY-123] Summary text" — extract the summary part
        raw_title = text("summary") or text("title")
        if raw_title.startswith("[") and "]" in raw_title:
            raw_title = raw_title.split("]", 1)[1].strip()

        # Due date — Jira uses RFC 2822; convert to ISO
        due_raw = text("due")
        due_iso = None
        if due_raw:
            try:
                from email.utils import parsedate_to_datetime
                due_iso = parsedate_to_datetime(due_raw).date().isoformat()
            except Exception:
                due_iso = due_raw[:10] if len(due_raw) >= 10 else None

        # Assignee — Jira exports use account ID attribute but also text
        assignee_el = item.find("assignee")
        assignee_email = ""
        if assignee_el is not None:
            # Sometimes the email is in the accountid attribute or the text
            acc = assignee_el.get("accountid", "")
            txt = (assignee_el.text or "").strip()
            # If it looks like an email use it; otherwise leave blank (user must map manually)
            assignee_email = txt if "@" in txt else ""

        # Labels — space-separated in <labels> or multiple <label> elements
        labels = []
        labels_el = item.find("labels")
        if labels_el is not None and labels_el.text:
            labels = [l.strip() for l in labels_el.text.split() if l.strip()]
        for label_el in item.findall("label"):
            if label_el.text:
                labels.append(label_el.text.strip())

        if not raw_title:
            continue

        tasks.append(ParsedTask(
            title          = raw_title[:255],
            description    = text("description"),
            status_name    = text("status") or "Backlog",
            priority       = normalize_priority(text("priority")),
            task_type      = normalize_type(text("type")),
            assignee_email = assignee_email,
            due_date       = due_iso,
            labels         = list(set(labels)),
            external_id    = text("key"),
        ))

    return tasks


def detect_mapping(file_content: str) -> dict:
    """Returns the field mapping for Jira exports (fixed schema)."""
    return AUTO_MAPPING.copy()
