# ── App Registry ─────────────────────────────────────────────────────────────
# Single source of truth for all product apps/modules.
# Replaces MODULE_REGISTRY in core/modules.py — core now imports this.
#
# Keys are short canonical identifiers: "projects", "org", "hr", "analytics".
#
# HOW TO ADD A NEW APP
#   1. Add an entry here in APP_REGISTRY.
#   2. Add its permissions block in PERMISSIONS below.
#   3. Add its default perm values to SYSTEM_ROLE_PERMISSIONS.
#   4. Add the module key mapping in core/modules.py (_OLD_TO_NEW is only
#      needed during the one-time data migration — see migration 0016).
#   Frontend picks up new apps automatically from GET /api/workspaces/{ws}/permissions/.

APP_REGISTRY = {
    "projects": {
        "name": "Project Management",
        "description": "Boards, tasks, sprints, Kanban, and time tracking.",
        "depends_on": [],
        "icon": "layout-grid",
    },
    "org": {
        "name": "Org Structure",
        "description": "Departments, teams, org chart, job titles, and reporting lines.",
        "depends_on": [],
        "icon": "building-2",
    },
    "hr": {
        "name": "HR Management",
        "description": "Leave management, attendance, and employee records.",
        "depends_on": ["org"],
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
    "org": {
        "org.manage": {
            "label": "Create and edit departments, teams, and reporting lines"
        },
    },
    "hr": {
        "hr.manage_leave": {"label": "Approve or reject leave requests"},
        "hr.manage_attendance": {"label": "Manage attendance records and policies"},
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
            "org": {
                "org.manage": False,
            },
            "hr": {
                "hr.manage_leave": False,
                "hr.manage_attendance": False,
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
            "org": {
                "org.manage": False,
            },
            "hr": {
                "hr.manage_leave": False,
                "hr.manage_attendance": False,
            },
        },
    },
}

# ── Registered webhook event names ──────────────────────────────────────────
# These are the public event names exposed to webhook subscribers.
# They are used:
#   • In the role-builder UI as valid event choices (WebhookCreateSerializer)
#   • In _fire_webhooks() (projects/views/helpers.py) to filter subscriber lists
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
# Step 2 — Map the internal broadcast key → public name (_EVENT_MAP)
#   File: backend/projects/views/helpers.py  (look for _EVENT_MAP dict, ~line 296)
#   Add an entry:
#       "sprint.archived": "sprint.archived",
#   The left side is the internal key passed to broadcast(); the right side
#   is the public event name delivered to subscribers.
#   If multiple internal actions should collapse into one public event
#   (e.g. "task.moved" → "task.updated"), map them to the same right-hand value.
#
# Step 3 — Fire the event from the relevant view or signal
#   Call broadcast() wherever the action happens:
#       from .helpers import broadcast
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
    "org.department.created",
    "org.department.updated",
    "org.department.deleted",
    "org.team.created",
    "org.team.updated",
    "org.team.deleted",
    "org.reporting_line.created",
    "org.reporting_line.deleted",
]
