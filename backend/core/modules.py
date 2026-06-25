"""
core/modules.py

The module gating system (require_module, tier, always_on) has been replaced
by role-level app_access permissions. This file is kept as a thin shim so
existing imports don't immediately break during the transition — callers
should migrate to workspaces.permissions.has_app_access().

MODULE_REGISTRY is kept for the modules list/toggle views until those are
reviewed and removed.
"""

from workspaces.constants import APP_REGISTRY

TIER_ORDER = ["free", "pro", "enterprise"]

MODULE_REGISTRY = APP_REGISTRY
