"""
Project-level permission utilities (v2.1.0).

Role hierarchy
==============
Workspace level (set once, applies everywhere):
  admin  → full control of all projects; CANNOT be restricted by project overrides
  member → editor on all projects by default; CAN be restricted per-project
  viewer → read-only everywhere; CAN be restricted further but never promoted

Project level (overrides only — can restrict Members/Viewers, never Admins):
  admin  → manages this project's settings & members (Members only)
  editor → create / edit / delete tasks
  viewer → read-only
  guest  → read-only via share link (no login)

Resolution rule
  workspace admin  →  always "admin"  (no override can touch this)
  workspace member →  min(member_weight=3, project_override_weight)
  workspace viewer →  always "viewer" (can't be promoted, guest is separate)
"""
from workspaces.models import WorkspaceMember

_PROJ_WEIGHT  = {"admin": 4, "editor": 3, "viewer": 2, "guest": 1}
_WEIGHT_ROLE  = {4: "admin", 3: "editor", 2: "viewer", 1: "guest"}
_ACTION_MIN   = {"view": 2, "edit": 3, "delete": 3, "admin": 4}


def get_effective_role(user, project):
    """
    Return the effective project role string for *user* on *project*,
    or None if the user is not a workspace member.
    """
    from .models import ProjectMember

    try:
        ws_member = WorkspaceMember.objects.get(workspace=project.workspace, user=user)
    except WorkspaceMember.DoesNotExist:
        return None

    # ── Workspace Admins are super-users ──────────────────────────────────────
    # No project-level override can restrict a workspace admin below "admin".
    if ws_member.role == WorkspaceMember.Role.ADMIN:
        return "admin"

    # ── Workspace Viewers are always read-only ─────────────────────────────────
    if ws_member.role == WorkspaceMember.Role.VIEWER:
        return "viewer"

    # ── Workspace Members — default editor, can be restricted per-project ─────
    # Member weight cap = 3 (editor). A project override can push it down to
    # viewer(2) or guest(1), but never above editor(3).
    member_cap = 3
    try:
        proj_member = ProjectMember.objects.get(project=project, user=user)
        proj_weight = _PROJ_WEIGHT.get(proj_member.role, member_cap)
    except ProjectMember.DoesNotExist:
        proj_weight = member_cap  # default: editor

    effective = min(member_cap, proj_weight)
    return _WEIGHT_ROLE.get(effective, "viewer")


def has_project_permission(user, project, action):
    """Return True if *user* has the required permission level on *project*."""
    role = get_effective_role(user, project)
    if role is None:
        return False
    weight = _PROJ_WEIGHT.get(role, 0)
    return weight >= _ACTION_MIN.get(action, 999)


def log_audit(actor, workspace, action, resource_type, resource_id, before=None, after=None):
    """Write an immutable AuditEvent row."""
    from .models import AuditEvent
    AuditEvent.objects.create(
        workspace=workspace,
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        before=before or {},
        after=after or {},
    )
