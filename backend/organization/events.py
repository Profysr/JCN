"""
organization/events.py — Real-time broadcast + webhook fan-out for org events.

Call broadcast_org_event(workspace_id, event_type, data) from any org view or
task after a mutation. Supported event_type values are the keys in _ORG_EVENT_MAP.
"""

import json
import logging

logger = logging.getLogger(__name__)

# Internal event key → public webhook event name.
# Add a new entry here whenever a new org mutation is wired up.
_ORG_EVENT_MAP = {
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


def broadcast_org_event(workspace_id, event_type, data):
    """Push an org event to the workspace WebSocket group and fan-out to webhooks.

    workspace_id may be a UUID instance or string.
    data must be JSON-serialisable (UUIDs/datetimes are coerced automatically).
    Failures are logged but never raised — mutations must not fail due to fanout errors.
    """
    _push_ws(workspace_id, event_type, data)
    _push_webhooks(workspace_id, event_type, data)


def _push_ws(workspace_id, event_type, data):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        from django.core.serializers.json import DjangoJSONEncoder

        safe_data = json.loads(json.dumps(data, cls=DjangoJSONEncoder))
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"workspace_{workspace_id}",
            {"type": "workspace.event", "data": {"type": event_type, "payload": safe_data}},
        )
    except Exception as exc:
        logger.warning("broadcast_org_event WS push failed event=%s: %s", event_type, exc)


def _push_webhooks(workspace_id, event_type, data):
    webhook_event = _ORG_EVENT_MAP.get(event_type)
    if not webhook_event:
        return
    try:
        from workspaces.models import Webhook
        from workspaces.tasks import deliver_webhook
        from django.core.serializers.json import DjangoJSONEncoder

        payload = json.loads(json.dumps(
            {"event": webhook_event, "workspace": str(workspace_id), "data": data},
            cls=DjangoJSONEncoder,
        ))
        for hook in Webhook.objects.filter(workspace__id=workspace_id, is_active=True):
            if not hook.events or webhook_event in hook.events:
                deliver_webhook.delay(str(hook.id), webhook_event, payload)
    except Exception as exc:
        logger.exception(
            "broadcast_org_event webhook fan-out failed event=%s workspace=%s: %s",
            event_type, workspace_id, exc,
        )


def broadcast_to_user(user_id, event_type, data):
    """Push a notification event to a single user's WebSocket group."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            {"type": "user.notification", "data": {"type": event_type, "payload": data}},
        )
    except Exception as exc:
        logger.warning("broadcast_to_user push failed user=%s event=%s: %s", user_id, event_type, exc)
