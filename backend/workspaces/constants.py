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
        "org.approve_profiles": {"label": "Review and approve member onboarding profiles"},
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
                "org.approve_profiles": False,
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
                "org.approve_profiles": False,
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
# These are the public event names exposed to webhook subscribers.
# They are used:
#   • In the role-builder UI as valid event choices (WebhookCreateSerializer)
#   • In core.events._fire_webhooks() to filter subscriber lists
#   • As the value of the X-JCN-Event header sent in each HTTP delivery
#
# Active count: 8 events (6 more commented out — not yet wired to broadcast())
#   Task (4):   task.created, task.updated, task.deleted, task.commented
#   Board (1):  status.updated
#   OKR (3):    objective.created, objective.updated, objective.deleted
#
# ── HOW TO ADD A NEW WEBHOOK EVENT ──────────────────────────────────────────
#
# Step 1 — Register the public name here (constants.py)
#   Add a string to WEBHOOK_EVENTS below, e.g. "sprint.archived".
#   Use dot-notation: "<domain>.<action>" (all lowercase).
#
# Step 2 — Register the event in the EVENTS registry
#   File: backend/core/events.py  (EVENTS dict)
#   Set its "webhook" key to the public name (add "chat" too for a chat card).
#   Add an entry:
#       "sprint.archived": "sprint.archived",
#   The left side is the internal key passed to broadcast(); the right side
#   is the public event name delivered to subscribers.
#   If multiple internal actions should collapse into one public event
#   (e.g. "task.moved" → "task.updated"), map them to the same right-hand value.
#
# Step 3 — Fire the event from the relevant view or signal
#   Call broadcast() wherever the action happens:
#       from core.events import broadcast
#       broadcast(workspace_id, "sprint.archived", serializer.data)
#   Files to edit: whichever view/signal handles the domain action
#   (projects/views/tasks.py, projects/views/objectives.py, workspaces/views.py, etc.)
#
# Step 4 — (Optional but recommended) Validate on subscription
#   File: backend/workspaces/serializers.py — WebhookCreateSerializer
#   Add a validate_events() method that rejects unknown event names:
#       from workspaces.constants import WEBHOOK_EVENTS
#       def validate_events(self, value):
#           unknown = set(value) - set(WEBHOOK_EVENTS)
#           if unknown:
#               raise serializers.ValidationError(f"Unknown events: {unknown}")
#           return value
#
# Step 5 — Write the payload shape in a comment near the broadcast() call
#   Future maintainers (and webhook consumers) need to know what fields to
#   expect. A one-line comment next to the broadcast() call is enough.
# ─────────────────────────────────────────────────────────────────────────────
WEBHOOK_EVENTS = [
    # Task
    "task.created",
    "task.updated",
    "task.deleted",
    # "task.assigned",    # not yet wired — no broadcast() call
    "task.commented",
    # "task.completed",   # not yet wired — no broadcast() call
    # Board
    "status.updated",
    # Sprint
    # "sprint.started",   # not yet wired — no broadcast() call
    # "sprint.completed", # not yet wired — no broadcast() call
    # Members
    # "member.added",     # not yet wired — no broadcast() call
    # "member.removed",   # not yet wired — no broadcast() call
    # OKRs
    "objective.created",
    "objective.updated",
    "objective.deleted",
    # Org Structure
    "org.profile.submitted",
    "org.profile.approved",
    "org.profile.updated",
    "org.department.created",
    "org.department.updated",
    "org.department.deleted",
    "org.department_member.added",
    "org.department_member.removed",
    "org.team.created",
    "org.team.updated",
    "org.team.deleted",
    "org.team_member.added",
    "org.team_member.removed",
    "org.job_title.created",
    "org.job_title.updated",
    "org.job_title.deleted",
    "org.reporting_line.created",
    "org.reporting_line.deleted",
]
