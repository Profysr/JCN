"""
Base types shared by all import parsers.
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class ParsedTask:
    title: str
    description: str            = ""
    status_name: str            = "Backlog"
    priority: str               = "medium"
    task_type: str              = "task"
    assignee_email: str         = ""
    due_date: Optional[str]     = None   # ISO date "YYYY-MM-DD" or None
    start_date: Optional[str]   = None
    labels: List[str]           = field(default_factory=list)
    estimate_hours: Optional[float] = None
    external_id: str            = ""     # source's own ID, for duplicate detection

    def to_dict(self):
        return {
            "title":           self.title,
            "description":     self.description,
            "status_name":     self.status_name,
            "priority":        self.priority,
            "task_type":       self.task_type,
            "assignee_email":  self.assignee_email,
            "due_date":        self.due_date,
            "start_date":      self.start_date,
            "labels":          self.labels,
            "estimate_hours":  self.estimate_hours,
            "external_id":     self.external_id,
        }

    @classmethod
    def from_dict(cls, d):
        return cls(**{k: v for k, v in d.items() if k in cls.__dataclass_fields__})


# Priority normaliser — maps various source priority strings → JCN values
_PRIORITY_MAP = {
    "blocker": "urgent", "critical": "urgent", "highest": "urgent", "urgent": "urgent",
    "high": "high", "major": "high",
    "medium": "medium", "normal": "medium", "moderate": "medium",
    "low": "low", "minor": "low",
    "lowest": "low", "trivial": "low",
    "none": "no_priority", "": "no_priority",
}


def normalize_priority(raw: str) -> str:
    return _PRIORITY_MAP.get((raw or "").lower().strip(), "medium")


# Task type normaliser
_TYPE_MAP = {
    "bug": "bug", "defect": "bug",
    "feature": "feature", "enhancement": "feature", "new feature": "feature",
    "story": "story", "user story": "story",
    "epic": "epic",
    "improvement": "improvement",
    "question": "question",
    "task": "task", "sub-task": "task", "subtask": "task",
}


def normalize_type(raw: str) -> str:
    return _TYPE_MAP.get((raw or "").lower().strip(), "task")
