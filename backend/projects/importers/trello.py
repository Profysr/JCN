"""
Trello JSON board export parser.
"""
import json
from typing import List
from .base import ParsedTask, normalize_priority

AUTO_MAPPING = {
    "name":   "title",
    "desc":   "description",
    "idList": "status_name",   # resolved to list name
    "due":    "due_date",
    "labels": "labels",
    "id":     "external_id",
}


def parse(file_content: str) -> List[ParsedTask]:
    """Parse a Trello JSON export and return a list of ParsedTask objects."""
    try:
        data = json.loads(file_content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}")

    if not isinstance(data, dict):
        raise ValueError("Expected a Trello board JSON object.")

    # Build list-id → name lookup
    lists = {lst["id"]: lst["name"] for lst in data.get("lists", []) if not lst.get("closed")}

    # Build member-id → email lookup
    members = {m["id"]: m.get("email", "") for m in data.get("members", [])}

    tasks = []
    for card in data.get("cards", []):
        if card.get("closed"):
            continue

        name = (card.get("name") or "").strip()
        if not name:
            continue

        status_name = lists.get(card.get("idList", ""), "Backlog")

        # Due date: "2025-01-31T10:00:00.000Z" → "2025-01-31"
        due_iso = None
        due_raw = card.get("due")
        if due_raw:
            due_iso = due_raw[:10]

        # Labels
        labels = [lbl.get("name", "") for lbl in card.get("labels", []) if lbl.get("name")]

        # Assignee email from first member
        assignee_email = ""
        for mid in card.get("idMembers", []):
            email = members.get(mid, "")
            if email:
                assignee_email = email
                break

        tasks.append(ParsedTask(
            title          = name[:255],
            description    = (card.get("desc") or "").strip(),
            status_name    = status_name,
            priority       = "medium",   # Trello has no native priority
            assignee_email = assignee_email,
            due_date       = due_iso,
            labels         = labels,
            external_id    = card.get("id", ""),
        ))

    return tasks


def detect_mapping(file_content: str) -> dict:
    return AUTO_MAPPING.copy()
