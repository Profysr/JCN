"""
Generic CSV parser with auto-detection for ClickUp, Asana, Linear, Notion,
Monday, GitHub Issues, and plain CSV exports.

Auto-detection heuristic: normalise column headers and score them against
known field patterns; returns detected mapping + confidence scores.
"""
import csv
import io
from typing import List, Tuple, Dict
from .base import ParsedTask, normalize_priority, normalize_type

# ── JCN fields that CSV columns can map to ───────────────────────────────────
JCN_FIELDS = [
    "title", "description", "status_name", "priority",
    "task_type", "assignee_email", "due_date", "start_date",
    "labels", "estimate_hours", "external_id",
]

# Patterns: (list of source header substrings) → jcn_field, confidence
_FIELD_PATTERNS = [
    (["task name", "task title", "name", "title", "summary", "subject", "issue title"], "title", 0.95),
    (["description", "detail", "notes", "body", "content"], "description", 0.9),
    (["status", "state", "stage", "column", "list"], "status_name", 0.9),
    (["priority", "severity", "urgency"], "priority", 0.95),
    (["type", "task type", "issue type", "kind"], "task_type", 0.85),
    (["assignee", "assigned to", "owner", "responsible", "reporter"], "assignee_email", 0.85),
    (["due date", "due", "deadline", "end date", "target date"], "due_date", 0.9),
    (["start date", "start", "begin date"], "start_date", 0.85),
    (["label", "labels", "tag", "tags", "category", "categories"], "labels", 0.85),
    (["estimate", "estimated hours", "time estimate", "story points", "points"], "estimate_hours", 0.8),
    (["id", "task id", "issue id", "key", "ticket"], "external_id", 0.8),
]


def _norm(s: str) -> str:
    return s.lower().replace("_", " ").replace("-", " ").strip()


def detect_mapping(headers: List[str]) -> Dict[str, dict]:
    """
    Returns {source_col: {jcn_field, confidence}} for each header.
    Columns that don't match anything get jcn_field="skip".
    """
    result = {}
    for hdr in headers:
        norm   = _norm(hdr)
        best   = ("skip", 0.0)
        for patterns, jcn_field, conf in _FIELD_PATTERNS:
            if any(p in norm or norm in p for p in patterns):
                if conf > best[1]:
                    best = (jcn_field, conf)
        result[hdr] = {"jcn_field": best[0], "confidence": best[1]}
    return result


def apply_mapping(row: dict, mapping: dict) -> dict:
    """
    Apply user-confirmed mapping (source_col → jcn_field) to a row dict.
    Returns a dict keyed by jcn_field.
    """
    out = {}
    for src_col, jcn_field in mapping.items():
        if jcn_field == "skip":
            continue
        val = row.get(src_col, "")
        if val:
            out[jcn_field] = val
    return out


def parse(file_content: str, field_mapping: dict = None) -> Tuple[List[ParsedTask], List[str]]:
    """
    Parse a CSV file.
    - If field_mapping is None, auto-detect and return ([], detected_mapping) for the
      preview step.
    - If field_mapping is given, apply it and return (tasks, []).
    Returns (tasks, detected_mapping_or_empty).
    """
    try:
        reader = csv.DictReader(io.StringIO(file_content))
        headers = reader.fieldnames or []
        rows    = list(reader)
    except Exception as exc:
        raise ValueError(f"CSV parse error: {exc}")

    if not headers:
        raise ValueError("CSV has no headers.")

    if field_mapping is None:
        # Return detected mapping for the preview/mapping step
        detected = detect_mapping(list(headers))
        return [], headers, detected

    tasks = []
    for row in rows:
        mapped = apply_mapping(row, field_mapping)
        title  = (mapped.get("title") or "").strip()
        if not title:
            continue

        # Parse labels: split on comma / semicolon / pipe
        labels_raw = mapped.get("labels", "")
        labels = [l.strip() for l in labels_raw.replace(";", ",").replace("|", ",").split(",") if l.strip()]

        # Parse estimate
        est_raw = mapped.get("estimate_hours", "")
        est = None
        if est_raw:
            try:
                est = float(est_raw)
            except ValueError:
                pass

        tasks.append(ParsedTask(
            title          = title[:255],
            description    = (mapped.get("description") or "").strip(),
            status_name    = (mapped.get("status_name") or "Backlog").strip() or "Backlog",
            priority       = normalize_priority(mapped.get("priority", "")),
            task_type      = normalize_type(mapped.get("task_type", "")),
            assignee_email = (mapped.get("assignee_email") or "").strip(),
            due_date       = _clean_date(mapped.get("due_date", "")),
            start_date     = _clean_date(mapped.get("start_date", "")),
            labels         = labels,
            estimate_hours = est,
            external_id    = (mapped.get("external_id") or "").strip(),
        ))

    return tasks, headers, {}


def _clean_date(raw: str) -> str:
    """Try to normalise a date string to YYYY-MM-DD; return None if unparseable."""
    if not raw:
        return None
    raw = raw.strip()
    # Already ISO
    if len(raw) >= 10 and raw[4] == "-":
        return raw[:10]
    # Try MM/DD/YYYY or DD/MM/YYYY
    for fmt in ("%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            pass
    return None
