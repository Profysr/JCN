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

# Maps each role name to a numeric weight used for comparison.
# Higher = more privilege. Add a new role here when introducing one;
# keep weights contiguous so ACTION_MIN thresholds stay intuitive.
_PROJ_WEIGHT  = {"admin": 4, "editor": 3, "viewer": 2, "guest": 1}

# Reverse of _PROJ_WEIGHT — used to turn a computed weight back into a role string. Must stay in sync with _PROJ_WEIGHT: every weight value needs an entry here.
_WEIGHT_ROLE  = {4: "admin", 3: "editor", 2: "viewer", 1: "guest"}

# Minimum weight required to perform each action.
# Raise a threshold to restrict an action to a higher role (e.g. "edit": 4
# would make editing admin-only). Lower it to open an action to more roles.
# Roles below the threshold receive 403 from has_project_permission().
_ACTION_MIN   = {"view": 2, "edit": 3, "delete": 4, "admin": 4}


def get_effective_role(user, board):
    """
    Return the effective board role string for *user* on *board*,
    or None if the user is not a workspace member.
    """
    from .models import BoardMember

    try:
        ws_member = WorkspaceMember.objects.get(workspace=board.workspace, user=user)
    except WorkspaceMember.DoesNotExist:
        return None

    if ws_member.role == WorkspaceMember.Role.ADMIN:
        return "admin"

    if ws_member.role == WorkspaceMember.Role.VIEWER:
        return "viewer"

    member_cap = 3
    try:
        board_member = BoardMember.objects.get(board=board, user=user)
        proj_weight = _PROJ_WEIGHT.get(board_member.role, member_cap)
    except BoardMember.DoesNotExist:
        proj_weight = member_cap  # default: editor

    effective = min(member_cap, proj_weight)
    return _WEIGHT_ROLE.get(effective, "viewer")


def has_project_permission(user, board, action):
    """Return True if *user* has the required permission level on *board*."""
    role = get_effective_role(user, board)
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
