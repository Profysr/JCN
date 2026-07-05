# ── App Registry ─────────────────────────────────────────────────────────────
# Single source of truth for all product apps/modules.
#
# Keys are short canonical identifiers: "projects", "people".
# "people" covers Org Structure + HR Management — one app, since HR's data
# model (leave, attendance, employee records) is built entirely on org data
# (employment profile, departments, job titles).
#
# HOW TO ADD A NEW APP
#   1. Add an entry here in APP_REGISTRY.
#   2. Add its permissions block in PERMISSIONS below.
#   3. Add its default perm values to SYSTEM_ROLE_PERMISSIONS.
#   Frontend picks up new apps automatically from GET /api/workspaces/{ws}/permissions/.

APP_REGISTRY = {
    "projects": {
        "name": "Project Management",
        "description": "Boards, tasks, sprints, Kanban, and time tracking.",
        "depends_on": [],
        "icon": "layout-grid",
    },
    "people": {
        "name": "People & HR",
        "description": "Departments, teams, org chart, job titles, leave, and attendance.",
        "depends_on": [],
        "icon": "users-round",
    },
}

# ── Permission Registry ───────────────────────────────────────────────────────
# Internal permissions grouped by app key.
# "workspace" is a special group — always present, never module-gated.
#
# HOW TO ADD A PERMISSION
#   1. Add it under the correct app key below.
#   2. Update SYSTEM_ROLE_PERMISSIONS to include it for each built-in role.
#   The /permissions/ endpoint, role editor, and serializer validation all
#   derive their structure from this dict — no other files need changing.

PERMISSIONS = {
    "workspace": {
        "member.invite": {"label": "Invite new members to the workspace"},
        "member.remove": {"label": "Remove members from the workspace"},
        "member.view_profile": {"label": "View member org profiles and contact info"},
        "settings.manage": {"label": "Manage workspace settings and integrations"},
        "api_keys.manage": {"label": "Create and revoke API n Webhook keys"},
    },
    "projects": {
        "pm.import_jobs": {"label": "Import tasks into a board (CSV, etc.)"},
        "pm.view_analytics": {"label": "View Analytics Page for Project Management App"},
        "board.create": {"label": "Create new boards"},
        "board.delete": {"label": "Delete boards"},
        "board.admin": {"label": "Manage board settings and statuses"},
        "task.view": {"label": "View tasks and board content"},
        "task.create": {"label": "Create tasks"},
        "task.edit": {"label": "Edit task fields (title, assignee, due date, etc.)"},
        "task.delete": {"label": "Delete tasks"},
        "task.move": {"label": "Move tasks between statuses (drag-and-drop)"},
        "task.comment": {"label": "Post and edit comments on tasks"},
        "sprint.manage": {"label": "Create, start, and complete sprints"},
        "automation.manage": {"label": "Create and edit automation rules"},
    },
    "people": {
        "org.view": {"label": "View departments, teams, org chart, and the people directory"},
        "org.manage": {"label": "Create and edit departments, teams, job titles, and reporting lines"},
        "hr.view": {"label": "View the HR dashboard and team leave / attendance overviews"},
        "hr.manage_leave": {"label": "Manage leave policies and approve or reject leave requests"},
        "hr.manage_attendance": {"label": "Manage attendance policies and records"},
        "hr.manage_documents": {"label": "Upload and manage employee documents"},
        "hr.manage_notes": {"label": "Create and manage private employee notes"},
    },
}

# ── System Role Defaults ──────────────────────────────────────────────────────
# Written into CustomRole when workspaces are created (see rbac.py).
# Each entry has two keys: "app_access" and "permissions".

SYSTEM_ROLE_PERMISSIONS = {
    "Admin": {
        "app_access": {app: True for app in APP_REGISTRY},
        "permissions": {
            app: {key: True for key in perms} for app, perms in PERMISSIONS.items()
        },
    },
    "Member": {
        "app_access": {app: True for app in APP_REGISTRY},
        "permissions": {
            "workspace": {
                "member.invite": False,
                "member.remove": False,
                "member.view_profile": False,
                "settings.manage": False,
                "api_keys.manage": False,
            },
            "projects": {
                "pm.import_jobs": False,
                "pm.view_analytics": False,
                "board.create": True,
                "board.delete": False,
                "board.admin": False,
                "task.view": True,
                "task.create": True,
                "task.edit": True,
                "task.delete": False,
                "task.move": True,
                "task.comment": True,
                "sprint.manage": True,
                "automation.manage": False,
            },
            "people": {
                "org.view": True,
                "org.manage": False,
                "hr.view": True,
                "hr.manage_leave": False,
                "hr.manage_attendance": False,
                "hr.manage_documents": False,
                "hr.manage_notes": False,
            },
        },
    },
    "Viewer": {
        "app_access": {app: True for app in APP_REGISTRY},
        "permissions": {
            "workspace": {
                "member.invite": False,
                "member.remove": False,
                "member.view_profile": True,
                "settings.manage": False,
                "api_keys.manage": False,
            },
            "projects": {
                "pm.view_analytics": False,
                "pm.import_jobs": False,
                "board.create": False,
                "board.delete": False,
                "board.admin": False,
                "task.view": True,
                "task.create": False,
                "task.edit": False,
                "task.delete": False,
                "task.move": False,
                "task.comment": False,
                "sprint.manage": False,
                "automation.manage": False,
            },
            "people": {
                "org.view": True,
                "org.manage": False,
                "hr.view": True,
                "hr.manage_leave": False,
                "hr.manage_attendance": False,
                "hr.manage_documents": False,
                "hr.manage_notes": False,
            },
        },
    },
}

# ── Registered webhook event names ──────────────────────────────────────────
from core.events import EVENTS
WEBHOOK_EVENTS = list(dict.fromkeys(
    meta["webhook"] for meta in EVENTS.values() if "webhook" in meta
))
