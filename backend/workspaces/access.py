"""
workspaces/access.py — the single access-control surface for the whole backend.

Read backend/ACCESS.md for the concepts, resolution order, and the per-endpoint
table of which check each view uses and why. Every app imports from here; do NOT
hand-roll membership / admin / permission / scope checks anywhere else.

Public surface
--------------
Resolution
    get_workspace_or_404(workspace_id, user)   -> Workspace   (raises Http404)
    member_workspace(user, workspace_id)       -> Workspace | None
    get_membership(user, workspace)            -> WorkspaceMember | None
    is_member(user, workspace)                 -> bool
    workspace_admins(workspace)                -> list[WorkspaceMember]

Identity tiers
    is_owner(user, workspace)                  -> bool
    is_workspace_admin(user, workspace)        -> bool   (owner OR settings.manage)
    require_workspace_admin(user, workspace)

App access (primitive #4)
    has_app_access(user, workspace, app_key)   -> bool
    require_app_access(user, workspace, app_key)

Fine-grained permission (primitive #5; app inferred from the key)
    has_perm(user, workspace, perm_key)        -> bool
    require_perm(user, workspace, perm_key)

API-key scope (ceiling applied only when the request is an API key)
    request_scopes(request)                    -> set | None   (None => JWT user)
    has_scope(request, scope)                  -> bool
    require_scope(request, scope)

One-call view guard
    authorize(request, workspace_id, *, app=None, perm=None, admin=False, scope=None)
        -> Workspace

Registry helpers (for the /permissions/ endpoint & serializers)
    get_enabled_apps(workspace, user)
    get_enabled_permissions(workspace, user)
"""

from django.core.exceptions import ObjectDoesNotExist
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied

from .constants import APP_REGISTRY, PERMISSIONS, SYSTEM_ROLE_PERMISSIONS
from .models import Workspace, WorkspaceMember

# Reverse map: "settings.manage" -> "workspace", "task.create" -> "projects", …
_PERM_TO_APP = {
    perm_key: app_key
    for app_key, perms in PERMISSIONS.items()
    for perm_key in perms
}

# API-key scope hierarchy — a broader scope implies the narrower ones.
_SCOPE_IMPLIES = {
    "read": {"read"},
    "write": {"read", "write"},
    "admin": {"read", "write", "admin"},
}


# ── Role resolution (internal) ────────────────────────────────────────────────
def _role_of_member(member):
    """The CustomRole for a WorkspaceMember, or None if it has no assignment."""
    try:
        return member.role_assignment.role
    except ObjectDoesNotExist:
        return None


def _get_role(user, workspace):
    """The user's CustomRole for this workspace, or None."""
    try:
        member = (
            WorkspaceMember.objects
            .select_related("role_assignment__role")
            .get(workspace=workspace, user=user)
        )
    except WorkspaceMember.DoesNotExist:
        return None
    return _role_of_member(member)


# ── Resolution ────────────────────────────────────────────────────────────────
def get_workspace_or_404(workspace_id, user):
    """Fetch a workspace the user is a member of, else 404. Use in HTTP views."""
    return get_object_or_404(Workspace, id=workspace_id, members__user=user)


def member_workspace(user, workspace_id):
    """Non-raising variant of get_workspace_or_404 — returns None instead of 404.

    For callers that can't let DRF turn an exception into a response (e.g. the
    WebSocket consumer, which must close the socket cleanly).
    """
    return Workspace.objects.filter(id=workspace_id, members__user=user).first()


def get_membership(user, workspace):
    return WorkspaceMember.objects.filter(workspace=workspace, user=user).first()


def is_member(user, workspace) -> bool:
    return WorkspaceMember.objects.filter(workspace=workspace, user=user).exists()


def workspace_admins(workspace):
    """Members who can manage the workspace: the owner + anyone whose role grants
    `settings.manage`. Used by notification tasks (e.g. "email all admins").
    """
    members = (
        WorkspaceMember.objects
        .filter(workspace=workspace)
        .select_related("user", "role_assignment__role")
    )
    admins = []
    for m in members:
        if m.user_id == workspace.owner_id:
            admins.append(m)
            continue
        role = _role_of_member(m)
        if role and role.permissions.get("workspace", {}).get("settings.manage", False):
            admins.append(m)
    return admins


# ── Identity tiers ────────────────────────────────────────────────────────────
def is_owner(user, workspace) -> bool:
    return workspace.owner_id == user.pk


def is_workspace_admin(user, workspace) -> bool:
    """Owner OR holder of the `settings.manage` permission. This is the canonical
    definition of "workspace admin" across the app.
    """
    if is_owner(user, workspace):
        return True
    return has_perm(user, workspace, "settings.manage")


def require_workspace_admin(user, workspace):
    if not is_workspace_admin(user, workspace):
        raise PermissionDenied("Workspace admin access required.")


# ── App access (primitive #4) ─────────────────────────────────────────────────
def has_app_access(user, workspace, app_key: str) -> bool:
    if is_owner(user, workspace):
        return True
    role = _get_role(user, workspace)
    if role is None:
        return False
    return bool(role.app_access.get(app_key, False))


def require_app_access(user, workspace, app_key: str):
    if not has_app_access(user, workspace, app_key):
        name = APP_REGISTRY.get(app_key, {}).get("name", app_key)
        raise PermissionDenied({"detail": f"You do not have access to {name}.", "app": app_key})


# ── Fine-grained permission (primitive #5) ────────────────────────────────────
def has_perm(user, workspace, perm_key: str) -> bool:
    """Check a permission by key alone; the app is inferred from the registry.

    A permission implicitly requires app access to its owning app first. The
    special "workspace" pseudo-group (invite/settings/api_keys) is never
    app-gated.
    """
    if is_owner(user, workspace):
        return True
    app_key = _PERM_TO_APP.get(perm_key)
    if app_key is None:
        return False
    if app_key != "workspace" and not has_app_access(user, workspace, app_key):
        return False
    role = _get_role(user, workspace)
    if role is None:
        return False
    return bool(role.permissions.get(app_key, {}).get(perm_key, False))


def require_perm(user, workspace, perm_key: str):
    if not has_perm(user, workspace, perm_key):
        raise PermissionDenied({"detail": "You do not have the required permission.", "permission": perm_key})


# ── API-key scopes ────────────────────────────────────────────────────────────
def request_scopes(request):
    """The scope ceiling for this request.

    None  => the request is NOT an API key (a real user via JWT) — no ceiling.
    set() => an API key; the set is its granted scopes (empty = no access).
    """
    key = getattr(request, "api_key", None)
    if key is None:
        return None
    return set(key.scopes or [])


def has_scope(request, scope: str) -> bool:
    scopes = request_scopes(request)
    if scopes is None:
        return True  # user (JWT) auth — full rights, no scope ceiling
    granted = set()
    for s in scopes:
        granted |= _SCOPE_IMPLIES.get(s, {s})
    return scope in granted


def require_scope(request, scope: str):
    if not has_scope(request, scope):
        raise PermissionDenied({"detail": f"API key is missing the required scope: {scope}.", "scope": scope})


# ── One-call view guard ───────────────────────────────────────────────────────
def authorize(request, workspace_id, *, app=None, perm=None, admin=False, scope=None):
    """Resolve the workspace (membership or 404) and enforce the requested gates.

    Order: scope ceiling (API keys) → workspace admin → app access → permission.
    Owner short-circuits every gate. Returns the Workspace.

        ws = authorize(request, workspace_id, app="hr", perm="hr.manage_leave", scope="write")
    """
    user = request.user
    workspace = get_workspace_or_404(workspace_id, user)
    if scope is not None:
        require_scope(request, scope)
    if admin:
        require_workspace_admin(user, workspace)
    if app is not None:
        require_app_access(user, workspace, app)
    if perm is not None:
        require_perm(user, workspace, perm)
    return workspace


# ── Registry helpers (consumed by the /permissions/ endpoint & serializers) ────
def get_enabled_apps(workspace, user):
    """APP_REGISTRY filtered to apps the user can access. Admins/owners get all."""
    if is_workspace_admin(user, workspace):
        return APP_REGISTRY
    return {
        app_key: app_def
        for app_key, app_def in APP_REGISTRY.items()
        if has_app_access(user, workspace, app_key)
    }


def get_enabled_permissions(workspace, user):
    """PERMISSIONS filtered to apps the user can access. The 'workspace' group is
    always included (never app-gated). Admins/owners get everything.
    """
    if is_workspace_admin(user, workspace):
        return PERMISSIONS
    return {
        app_key: perms
        for app_key, perms in PERMISSIONS.items()
        if app_key == "workspace" or has_app_access(user, workspace, app_key)
    }


# ── Role provisioning ─────────────────────────────────────────────────────────
def create_system_roles(workspace):
    """Ensure the three built-in system roles (Admin/Member/Viewer) exist for a
    workspace. Returns {role_name: CustomRole}. Idempotent via get_or_create.
    Called once when a workspace is created (see workspaces/serializers.py).
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
