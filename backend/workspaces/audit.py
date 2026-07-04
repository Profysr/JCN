"""workspaces/audit.py — write helpers for the workspace-wide AuditEvent log.

Any app can call these to record a structural or permission-related change.
Read-only consumption (an audit-log viewer endpoint) doesn't exist yet — this
is a write-only trail for now.
"""

from .models import AuditEvent


def log_audit(actor, workspace, action, resource_type, resource_id, before=None, after=None):
    """Write an immutable AuditEvent row."""
    AuditEvent.objects.create(
        workspace=workspace,
        actor=actor,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id),
        before=before or {},
        after=after or {},
    )


def bulk_log_audit(actor, workspace, action, resource_type, entries):
    """Write multiple AuditEvent rows in one query.

    entries: iterable of dicts with keys resource_id, before (opt), after (opt).
    """
    AuditEvent.objects.bulk_create(
        [
            AuditEvent(
                workspace=workspace,
                actor=actor,
                action=action,
                resource_type=resource_type,
                resource_id=str(entry["resource_id"]),
                before=entry.get("before") or {},
                after=entry.get("after") or {},
            )
            for entry in entries
        ]
    )
