"""
workspaces/rbac.py — Custom RBAC helpers (Phase D).

Public surface
--------------
has_workspace_permission(user, workspace, action) -> bool
    Returns True if the user is allowed to perform `action` in `workspace`.

    Resolution order:
    1. Workspace owner → always True (full admin).
    2. RoleAssignment → check CustomRole.permissions[action].
    3. No assignment → False (member must be assigned a role).

create_system_roles(workspace) -> dict[str, CustomRole]
    Creates the three built-in system roles for a workspace and returns them.
    Idempotent via get_or_create.
"""

from .constants import SYSTEM_ROLE_PERMISSIONS
from .permissions import resolve_permission


def has_workspace_permission(user, workspace, action: str) -> bool:
    """Return True if `user` has `action` permission in `workspace`."""
    return resolve_permission(user, workspace, action)


def create_system_roles(workspace):
    """
    Ensure the three built-in system roles exist for `workspace`.
    Returns a dict {role_name: CustomRole instance}.
    """
    from .models import CustomRole

    roles = {}
    for name, role_data in SYSTEM_ROLE_PERMISSIONS.items():
        role, _ = CustomRole.objects.get_or_create(
            workspace=workspace,
            name=name,
            defaults={
                "description": f"Built-in {name} role",
                "is_system": True,
                "app_access": role_data["app_access"],
                "permissions": role_data["permissions"],
            },
        )
        roles[name] = role
    return roles
