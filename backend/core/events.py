"""
core/events.py — THE single home for every real-time / fan-out primitive.

Every event in JCN is one of two kinds:

INTERNAL events
    WebSocket-only. Pushed to connected browsers so the UI updates live,
    never forwarded outside the system. Two delivery targets:
      - workspace scope → group "workspace_<id>"  (everyone in the workspace)
        e.g. task.moved, import.progress, presence.updated, reaction.updated,
             status.updated column edits, org.* structure changes
      - user scope      → group "user_<id>"       (one person's inbox bell)
        e.g. notification.created

EXTERNAL events
    Forwarded beyond the app in addition to the WS push:
      - Webhooks — an internal event name listed in WEBHOOK_EVENT_MAP below is
        translated to its public name and queued via
        workspaces.tasks.deliver_webhook (Celery, signed, retried).
        The public names must stay a subset of
        workspaces.constants.WEBHOOK_EVENTS (what users can subscribe to).
      - Chat integrations (Teams / Google Chat) — integrations.services
        .fanout_notification(), called explicitly from task-notification flows.

How to use / extend:
    * Fire an event after a mutation      → broadcast(workspace_id, event, data)
    * Notify one user (inbox + WS bell)   → notify(recipient, actor, verb, workspace, task=None)
    * Notify many users in one DB write   → push_inbox_items(rows)
    * Make an event public (webhook)      → add it to WEBHOOK_EVENT_MAP (and to
      workspaces.constants.WEBHOOK_EVENTS if it's a brand-new public name)
    * An event NOT in WEBHOOK_EVENT_MAP is automatically internal-only.

All functions here are fire-and-forget: failures are logged, never raised —
a mutation must never 500 because fan-out plumbing hiccupped.
"""

import json
import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

logger = logging.getLogger(__name__)

# ── Event registry: internal event name → public webhook event name ──────────
# Several internal events collapse into one public event (e.g. task.moved →
# task.updated) so external consumers get a stable contract.
WEBHOOK_EVENT_MAP = {
    # projects
    "task.created": "task.created",
    "task.updated": "task.updated",
    "task.moved": "task.updated",
    "task.deleted": "task.deleted",
    "comment.created": "task.commented",
    "tasks.bulk_updated": "task.updated",
    "tasks.bulk_deleted": "task.deleted",
    "status.updated": "status.updated",
    "sprint.started": "sprint.started",
    "sprint.completed": "sprint.completed",
    "objective.created": "objective.created",
    "objective.updated": "objective.updated",
    "objective.deleted": "objective.deleted",
    # organization
    "org.profile.submitted": "org.profile.submitted",
    "org.profile.approved": "org.profile.approved",
    "org.profile.updated": "org.profile.updated",
    "org.department.created": "org.department.created",
    "org.department.updated": "org.department.updated",
    "org.department.deleted": "org.department.deleted",
    "org.department_member.added": "org.department_member.added",
    "org.department_member.removed": "org.department_member.removed",
    "org.team.created": "org.team.created",
    "org.team.updated": "org.team.updated",
    "org.team.deleted": "org.team.deleted",
    "org.team_member.added": "org.team_member.added",
    "org.team_member.removed": "org.team_member.removed",
    "org.job_title.created": "org.job_title.created",
    "org.job_title.updated": "org.job_title.updated",
    "org.job_title.deleted": "org.job_title.deleted",
    "org.reporting_line.created": "org.reporting_line.created",
    "org.reporting_line.deleted": "org.reporting_line.deleted",
}

# InboxItem.Verb → InboxItem.EventType used by notify()
_VERB_TO_EVENT_TYPE = {
    "task_assigned": "assigned",
    "task_commented": "commented",
    "task_mentioned": "mentioned",
    "approval_requested": "approved",
    "org_profile_submitted": "org",
    "org_profile_approved": "org",
}


def _json_safe(data):
    """The channel layer can't serialize UUID/datetime/Decimal — round-trip
    through DjangoJSONEncoder so payloads are plain strings/numbers."""
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


# ── Broadcast primitives ──────────────────────────────────────────────────────

def broadcast(workspace_id, event_type, data):
    """Push a workspace-scoped event: WS group "workspace_<id>" + webhook fan-out.

    The one entry point every view/task should call after a mutation.
    workspace_id may be a UUID or string; data must be JSON-serialisable
    (UUIDs/datetimes coerced automatically).
    """
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"workspace_{workspace_id}",
            {"type": "workspace.event", "data": {"type": event_type, "payload": _json_safe(data)}},
        )
    except Exception as exc:
        logger.warning("broadcast WS push failed event=%s workspace=%s: %s", event_type, workspace_id, exc)
    _fire_webhooks(workspace_id, event_type, data)


def broadcast_to_user(user_id, event_type, data):
    """Push a user-scoped event to WS group "user_<id>" (personal notifications)."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            {"type": "user.notification", "data": {"type": event_type, "payload": _json_safe(data)}},
        )
    except Exception as exc:
        logger.warning("broadcast_to_user push failed user=%s event=%s: %s", user_id, event_type, exc)


def _fire_webhooks(workspace_id, event_type, data):
    """Queue signed webhook deliveries for every active hook subscribed to this event.

    Internal-only events (absent from WEBHOOK_EVENT_MAP) are skipped silently.
    """
    webhook_event = WEBHOOK_EVENT_MAP.get(event_type)
    if not webhook_event:
        return
    try:
        from workspaces.models import Webhook
        from workspaces.tasks import deliver_webhook

        payload = _json_safe(
            {"event": webhook_event, "workspace": str(workspace_id), "data": data}
        )
        for hook in Webhook.objects.filter(workspace__id=workspace_id, is_active=True):
            # hook.events is a JSON list; empty list means "all events".
            if not hook.events or webhook_event in hook.events:
                deliver_webhook.delay(str(hook.id), webhook_event, payload)
    except Exception as exc:
        logger.exception(
            "webhook fan-out failed event=%s workspace=%s: %s", event_type, workspace_id, exc
        )


# ── Inbox notifications (InboxItem row + user-scoped WS push) ────────────────

def push_inbox_items(rows):
    """Bulk-create InboxItem rows and push "notification.created" to each recipient.

    rows: list of InboxItem constructor kwargs (user or user_id, workspace,
    actor_id, actor_name, verb, event_type, resource_name, board_id,
    project_name, meta). One INSERT for all rows; the WS payload is derived
    entirely from the created items so callers never hand-build payloads.
    Returns the created items ([] on failure).
    """
    from workspaces.models import InboxItem

    try:
        items = InboxItem.objects.bulk_create([InboxItem(**row) for row in rows])
    except Exception as exc:
        logger.exception("push_inbox_items bulk_create failed: %s", exc)
        return []

    # bulk_create skips save(), so created_at may not be reflected on the
    # returned objects — fall back to now() for the WS payload timestamp.
    now = timezone.now()
    for item in items:
        broadcast_to_user(
            str(item.user_id),
            "notification.created",
            {
                "id": str(item.id),
                "actor_id": item.actor_id,
                "actor_name": item.actor_name,
                "verb": item.verb,
                "event_type": item.event_type,
                "resource_name": item.resource_name,
                "board_id": item.board_id,
                "project_name": item.project_name,
                "meta": item.meta,
                "status": "unread",
                "created_at": (item.created_at or now).isoformat(),
            },
        )
    return items


def notify(recipient, actor, verb, workspace, task=None):
    """Create one InboxItem and push it to the recipient. No-op if actor == recipient.

    task is optional — HR/org notifications aren't task-bound.
    """
    if recipient == actor:
        return

    meta = {"workspace_id": str(workspace.id)}
    resource_name = ""
    board_id = ""
    project_name = ""
    if task is not None:
        meta.update({
            "task_id": str(task.id),
            "task_title": task.title,
            "board_id": str(task.board_id),
        })
        resource_name = task.title
        board_id = str(task.board_id)
        project_name = task.board.name if task.board_id else ""

    push_inbox_items([{
        "user": recipient,
        "workspace": workspace,
        "actor_id": str(actor.id),
        "actor_name": actor.full_name or actor.email,
        "verb": verb,
        "event_type": _VERB_TO_EVENT_TYPE.get(verb, "assigned"),
        "resource_name": resource_name,
        "board_id": board_id,
        "project_name": project_name,
        "meta": meta,
    }])
