"""
Project-level permission utilities (vD.2).

How it works
============
has_project_permission(user, board, action) is the single entry point.

1. Workspace owner → always True.
2. CustomRole permission check via has_workspace_permission() — data-driven via
   the workspace role system (workspaces/constants.py PERMISSIONS).
3. BoardMember override — a per-board role can grant additional access within
   one board (e.g. a Viewer-level workspace member promoted to editor on one
   specific board). The fallback reads directly from BOARD_ROLE_PERMISSIONS.

HOW TO ADD A BOARD ROLE
  Add one entry to BOARD_ROLE_PERMISSIONS below — no other file needs changing.
  The role immediately works in has_project_permission(), get_effective_role(),
  and BoardPermissionsView (which exposes the full table to the frontend).

HOW TO ADD A BOARD ACTION
  1. Add it to every role in BOARD_ROLE_PERMISSIONS.
  2. Add a mapping in _ACTION_TO_PERM (workspace CustomRole key).
  That is all — no weight constants, no threshold tables.
"""

from workspaces.models import WorkspaceMember
from workspaces.access import has_perm

# ── Board role → action permission table ──────────────────────────────────────
# Single source of truth for board-level role capabilities.
# Each role explicitly declares which actions it allows — no weight arithmetic.
#
# To add a role:   add one entry here.
# To add an action: add the key to every role entry + one entry in _ACTION_TO_PERM.

BOARD_ROLE_PERMISSIONS = {
    "admin": {
        "view": True,
        "edit": True,
        "delete": True,
        "move": True,
        "comment": True,
        "admin": True,
    },
    "editor": {
        "view": True,
        "edit": True,
        "delete": False,
        "move": True,
        "comment": True,
        "admin": False,
    },
    "viewer": {
        "view": True,
        "edit": False,
        "delete": False,
        "move": False,
        "comment": True,
        "admin": False,
    },
    "guest": {
        "view": True,
        "edit": False,
        "delete": False,
        "move": False,
        "comment": False,
        "admin": False,
    },
}

# Maps board actions → workspace-level CustomRole permission keys.
# To add an action: add one entry here.
_ACTION_TO_PERM = {
    "view": "task.view",
    "edit": "task.edit",
    "delete": "task.delete",
    "move": "task.move",
    "comment": "task.comment",
    "admin": "board.admin",
}


def has_project_permission(user, board, action):
    """
    Return True if *user* can perform *action* on *board*.

    Checks (in order):
      1. Workspace owner → True.
      2. CustomRole has the matching workspace permission → True.
      3. BoardMember override role allows the action → True.
      4. Otherwise → False.
    """
    from .models import BoardMember

    workspace = board.workspace
    if not WorkspaceMember.objects.filter(workspace=workspace, user=user, is_active=True).exists():
        return False

    if workspace.owner_id == user.pk:
        return True

    # Primary: workspace-level CustomRole permission.
    perm_key = _ACTION_TO_PERM.get(action)
    if perm_key and has_perm(user, workspace, perm_key):
        return True

    # Fallback: per-board BoardMember override.
    try:
        bm = BoardMember.objects.get(board=board, user=user)
        return BOARD_ROLE_PERMISSIONS.get(bm.role, {}).get(action, False)
    except BoardMember.DoesNotExist:
        return False


def get_effective_role(user, board):
    """
    Return the effective board role string for serializers, or None if the user has no access. Checks from most to least privileged.
    """
    if not has_project_permission(user, board, "view"):
        return None
    if has_project_permission(user, board, "admin"):
        return "admin"
    if has_project_permission(user, board, "edit"):
        return "editor"
    return "viewer"


def user_can_be_board_participant(user, board):
    """Return True if user can be assigned/mentioned on a private board.

    Covers workspace owner, workspace-level board.admin, and explicit BoardMember.
    Public boards always return True — call site must check board.is_private first.
    """
    from .models import BoardMember

    workspace = board.workspace
    if workspace.owner_id == user.pk:
        return True
    if has_perm(user, workspace, "board.admin"):
        return True
    return BoardMember.objects.filter(board=board, user=user).exists()


# ── View guards (raise DRF exceptions) ────────────────────────────────────────
_PERM_MSG = {"admin": "Admin role required.", "edit": "Editor role required."}


def _is_workspace_admin(workspace, user):
    return workspace.owner_id == user.pk or has_perm(user, workspace, "board.admin")


def _require_board_perm(user, board, role):
    """Raise 403 unless *user* can perform *role* (board action) on *board*."""
    from rest_framework.exceptions import PermissionDenied

    if not has_project_permission(user, board, role):
        raise PermissionDenied(
            _PERM_MSG.get(role, f"{role.capitalize()} role required.")
        )


def _require_board_admin(request, workspace_id, board_id):
    """Return (workspace, board) or raise 403/404."""
    from django.shortcuts import get_object_or_404
    from workspaces.models import Workspace
    from .models import Board

    workspace = get_object_or_404(Workspace, id=workspace_id, members__user=request.user)
    board = get_object_or_404(Board, id=board_id, workspace=workspace)
    _require_board_perm(request.user, board, "admin")
    return workspace, board
