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
    Forwarded beyond the app in addition to the WS push. What an event reaches
    is declared in ONE place — the EVENTS registry below:
      - "webhook" → translated to its public name and queued via
        workspaces.tasks.deliver_webhook (Celery, signed, retried).
        workspaces.constants.WEBHOOK_EVENTS is derived from this registry — add the "webhook" key here and it's automatically a valid public name.
      - "chat"    → queued via integrations.tasks.send_chat_notification
        (Celery) and posted to every mapped Teams / Google Chat channel.

How to use / extend:
    * Fire an event after a mutation      → broadcast(workspace_id, event, data)
      — pass task_id= + actor_id= if the event has a chat surface. That ONE
      call covers WS + webhooks + chat; never wire those individually.
    * Notify one user (inbox + WS bell)   → notify(recipient, actor, verb, workspace, task=None)
    * Notify many users in one DB write   → push_inbox_items(rows)
    * Add a new event                     → one entry in EVENTS
    * Add a new notification verb         → one entry in NOTIFICATION_VERBS
    * An event absent from EVENTS is automatically WebSocket-only.

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

# ── THE event registry ────────────────────────────────────────────────────────
# One entry per internal event. Each entry declares every external surface the
# event reaches; broadcast() reads this to fan out — call sites never wire
# webhooks/chat themselves.
#   "webhook" — public webhook event name. Several internal events collapse
#               into one public name (task.moved → task.updated) so external
#               consumers get a stable contract. Absent → never leaves the app.
#   "chat"    — NOTIFICATION_VERBS key for Teams/Google Chat cards. Only
#               task-bound events can have one (chat formatters render a task).
#               Fires only when broadcast() is given task_id + actor_id.
# An event absent from this registry is WebSocket-only (import.progress,
# presence.updated, notification.created, reaction.updated, approval.updated…).
EVENTS = {
    # projects
    "task.created": {"webhook": "task.created", "chat": "task_created"},
    "task.updated": {"webhook": "task.updated"},
    "task.assigned": {"webhook": "task.assigned", "chat": "task_assigned"},
    "task.moved": {"webhook": "task.updated"},
    "task.deleted": {"webhook": "task.deleted"},
    "comment.created": {"webhook": "task.commented", "chat": "task_commented"},
    "tasks.bulk_updated": {"webhook": "task.updated"},
    "tasks.bulk_deleted": {"webhook": "task.deleted"},
    "status.updated": {"webhook": "status.updated"},
    "sprint.started": {"webhook": "sprint.started"},
    "sprint.completed": {"webhook": "sprint.completed"},
    "approval.created": {"chat": "approval_requested"},
    "objective.created": {"webhook": "objective.created"},
    "objective.updated": {"webhook": "objective.updated"},
    "objective.deleted": {"webhook": "objective.deleted"},
    # organization (webhook name == internal name)
    "org.profile.updated": {"webhook": "org.profile.updated"},
    "org.department.created": {"webhook": "org.department.created"},
    "org.department.updated": {"webhook": "org.department.updated"},
    "org.department.deleted": {"webhook": "org.department.deleted"},
    "org.department_member.added": {"webhook": "org.department_member.added"},
    "org.department_member.removed": {"webhook": "org.department_member.removed"},
    "org.team.created": {"webhook": "org.team.created"},
    "org.team.updated": {"webhook": "org.team.updated"},
    "org.team.deleted": {"webhook": "org.team.deleted"},
    "org.team_member.added": {"webhook": "org.team_member.added"},
    "org.team_member.removed": {"webhook": "org.team_member.removed"},
    "org.job_title.created": {"webhook": "org.job_title.created"},
    "org.job_title.updated": {"webhook": "org.job_title.updated"},
    "org.job_title.deleted": {"webhook": "org.job_title.deleted"},
    "org.reporting_line.created": {"webhook": "org.reporting_line.created"},
    "org.reporting_line.updated": {"webhook": "org.reporting_line.updated"},
    "org.reporting_line.deleted": {"webhook": "org.reporting_line.deleted"},
    # hr (chat-only — not exposed as public webhooks)
    "leave.requested": {"chat": "leave.requested"},
    "leave.approved": {"chat": "leave.approved"},
    "leave.rejected": {"chat": "leave.rejected"},
}

# Public chat-event verbs — every distinct "chat" surface declared in EVENTS.
# Integrations (Teams/Google Chat) let a channel subscribe to these; derived
# here so the subscribable list can't drift from what broadcast() actually
# delivers (the old hand-maintained list offered dead events and omitted live
# ones). Ordered by first appearance in EVENTS.
CHAT_EVENTS = list(
    dict.fromkeys(meta["chat"] for meta in EVENTS.values() if "chat" in meta)
)

# ── Notification verb registry ────────────────────────────────────────────────
# THE contract for every notification verb. Adding a verb here is the ONLY step
# needed to make it render correctly in the bell for every app — the frontend
# fetches this registry (GET /api/notifications/verb-meta/) instead of keeping
# its own copy, so backend and frontend can never drift out of sync.
#
#   app   — APP_REGISTRY key (workspaces/constants.py) the verb belongs to.
#           Drives per-app inbox filtering (InboxItem.app) and the bell's
#           per-app tabs. Required — every verb must belong to exactly one app.
#   icon  — kebab-case name resolved to a lucide-react component via the
#           frontend's ICON_MAP (NotificationBell.jsx). Unknown/missing names
#           fall back to a generic icon so a typo here never breaks the UI.
#   tone  — Tailwind text-color class for the icon badge.
NOTIFICATION_VERBS = {
    # projects
    "task_created": {
        "event_type": "assigned",
        "label": "📋 Task Created",
        "app": "projects",
        "icon": "list-plus",
        "tone": "text-emerald-500",
    },
    "task_assigned": {
        "event_type": "assigned",
        "label": "👤 Task Assigned",
        "app": "projects",
        "icon": "user-plus",
        "tone": "text-indigo-500",
    },
    "task_commented": {
        "event_type": "commented",
        "label": "💬 New Comment",
        "app": "projects",
        "icon": "message-square",
        "tone": "text-sky-500",
    },
    "task_mentioned": {
        "event_type": "mentioned",
        "label": "💬 You Were Mentioned",
        "app": "projects",
        "icon": "at-sign",
        "tone": "text-violet-500",
    },
    "task_completed": {
        "event_type": "assigned",
        "label": "✅ Task Completed",
        "app": "projects",
        "icon": "check-circle-2",
        "tone": "text-green-500",
    },
    "sprint_started": {
        "event_type": "automated",
        "label": "🚀 Sprint Started",
        "app": "projects",
        "icon": "rocket",
        "tone": "text-purple-500",
    },
    "sprint_completed": {
        "event_type": "automated",
        "label": "🏁 Sprint Completed",
        "app": "projects",
        "icon": "flag",
        "tone": "text-teal-500",
    },
    "approval_requested": {
        "event_type": "approved",
        "label": "✋ Approval Requested",
        "app": "projects",
        "icon": "shield-check",
        "tone": "text-amber-500",
    },
    # people (org + hr)
    "leave.requested": {
        "event_type": "assigned",
        "label": "🌴 Leave Requested",
        "app": "people",
        "icon": "calendar-clock",
        "tone": "text-amber-500",
    },
    "leave.approved": {
        "event_type": "assigned",
        "label": "✅ Leave Approved",
        "app": "people",
        "icon": "calendar-check-2",
        "tone": "text-green-500",
    },
    "leave.rejected": {
        "event_type": "assigned",
        "label": "❌ Leave Rejected",
        "app": "people",
        "icon": "calendar-x-2",
        "tone": "text-red-500",
    },
    "leave.carried_over": {
        "event_type": "hr",
        "label": "🔁 Leave Carried Over",
        "app": "people",
        "icon": "refresh-cw",
        "tone": "text-blue-500",
    },
    "document_expiring": {
        "event_type": "hr",
        "label": "📄 Document Expiring",
        "app": "people",
        "icon": "file-warning",
        "tone": "text-orange-500",
    },
    "attendance.geofence_flagged": {
        "event_type": "hr",
        "label": "📍 Clock-in Outside Geofence",
        "app": "people",
        "icon": "map-pin",
        "tone": "text-rose-500",
    },
    "attendance.missed_clock_out": {
        "event_type": "hr",
        "label": "⏰ Missed Clock-out",
        "app": "people",
        "icon": "clock",
        "tone": "text-red-500",
    },
    # workspace — membership/role events. "workspace" isn't in
    # workspaces.constants.APP_REGISTRY (it's the always-on pseudo-app every
    # member implicitly has access to, never module-gated), but it's a real
    # bucket here so these notifications get their own inbox tab like any
    # other app instead of landing unattributed.
    "member.invited": {
        "event_type": "assigned",
        "label": "✉️ Member Invited",
        "app": "workspace",
        "icon": "user-plus",
        "tone": "text-indigo-500",
    },
    "invite.accepted": {
        "event_type": "assigned",
        "label": "🎉 Invite Accepted",
        "app": "workspace",
        "icon": "user-check",
        "tone": "text-green-500",
    },
    "member.removed": {
        "event_type": "assigned",
        "label": "🚪 Member Removed",
        "app": "workspace",
        "icon": "user-minus",
        "tone": "text-red-500",
    },
    "member.role_assigned": {
        "event_type": "assigned",
        "label": "🔑 Role Updated",
        "app": "workspace",
        "icon": "key-round",
        "tone": "text-amber-500",
    },
}

# Every valid InboxItem.app value — derived from the verb registry above, not
# hand-maintained separately, so a new app added here is automatically a valid
# value everywhere else (the model's CheckConstraint, admin, etc). Sorted so
# the generated migration's constraint SQL doesn't churn on registry reorders.
VALID_NOTIFICATION_APPS = sorted({v["app"] for v in NOTIFICATION_VERBS.values()})


def verb_event_type(verb):
    """InboxItem.event_type for a verb (defaults to "assigned")."""
    return NOTIFICATION_VERBS.get(verb, {}).get("event_type", "assigned")


def verb_app(verb):
    """APP_REGISTRY key a verb belongs to (blank if the verb is unregistered)."""
    return NOTIFICATION_VERBS.get(verb, {}).get("app", "")


def verb_label(verb):
    """Human-readable label for a verb (chat cards, digests)."""
    meta = NOTIFICATION_VERBS.get(verb)
    return meta["label"] if meta else verb.replace("_", " ").replace(".", " ").title()


def _json_safe(data):
    """The channel layer can't serialize UUID/datetime/Decimal — round-trip through DjangoJSONEncoder so payloads are plain strings/numbers."""
    return json.loads(json.dumps(data, cls=DjangoJSONEncoder))


# ── Broadcast primitives ──────────────────────────────────────────────────────
def broadcast(
    workspace_id, event_type, data, *, task_id=None, actor_id=None, chat=None
):
    """THE one fan-out call after a mutation. Reads EVENTS and pushes to every
    surface the event is registered for:

      1. WebSocket — always, to group "workspace_<id>".
      2. Webhooks  — if the event has a "webhook" name (Celery, signed, retried).
      3. Teams/Google Chat — if the event has a "chat" verb and actor_id is
         passed, plus ONE of:
           task_id — task events; the chat card is built from the task, and
                     board-mapped channels are included.
           chat    — any other event; a resource dict rendered as-is:
                     {"title", "subtitle"?, "facts"?: {k: v}, "url"?}.
         Event-scoped: one card per event per channel, never per recipient.

    workspace_id may be a UUID or string; data must be JSON-serialisable
    (UUIDs/datetimes coerced automatically).
    """
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"workspace_{workspace_id}",
            {
                "type": "workspace.event",
                "data": {"type": event_type, "payload": _json_safe(data)},
            },
        )
    except Exception as exc:
        logger.warning(
            "broadcast WS push failed event=%s workspace=%s: %s",
            event_type,
            workspace_id,
            exc,
        )

    _fire_webhooks(workspace_id, event_type, data)

    chat_verb = EVENTS.get(event_type, {}).get("chat")
    if chat_verb and actor_id and (task_id or chat):
        _queue_chat_notification(
            workspace_id, chat_verb, actor_id, task_id=task_id, resource=chat
        )


def broadcast_to_user(user_id, event_type, data):
    """Push a user-scoped event to WS group "user_<id>" (personal notifications)."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{user_id}",
            {
                "type": "user.notification",
                "data": {"type": event_type, "payload": _json_safe(data)},
            },
        )
    except Exception as exc:
        logger.warning(
            "broadcast_to_user push failed user=%s event=%s: %s",
            user_id,
            event_type,
            exc,
        )


def _fire_webhooks(workspace_id, event_type, data):
    """Queue signed webhook deliveries for every active hook subscribed to this event.

    Events without a "webhook" entry in EVENTS are skipped silently.
    """
    webhook_event = EVENTS.get(event_type, {}).get("webhook")
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
            "webhook fan-out failed event=%s workspace=%s: %s",
            event_type,
            workspace_id,
            exc,
        )


# ── Inbox notifications (InboxItem row + user-scoped WS push) ────────────────


def push_inbox_items(rows):
    """Bulk-create InboxItem rows and push "notification.created" to each recipient.

    rows: list of InboxItem constructor kwargs (user or user_id, workspace, actor_id, actor_name, verb, resource_name, board_id, board_name, meta).
    event_type is derived from the verb via NOTIFICATION_VERBS — don't pass it.
    One INSERT for all rows; the WS payload is derived entirely from the created items so callers never hand-build payloads.
    Returns the created items ([] on failure).
    """
    from workspaces.models import InboxItem

    # Fail loud per-row on an unregistered verb rather than silently writing
    # app="" — InboxItem.app has a DB CheckConstraint against
    # VALID_NOTIFICATION_APPS, so that row would fail bulk_create anyway
    # (taking every OTHER row in the batch down with it). Dropping just the
    # bad row and logging it loudly means a typo'd/forgotten verb shows up in
    # logs immediately instead of silently corrupting app attribution or
    # (worse) killing a legitimate row's notification.
    good_rows = []
    for row in rows:
        if row["verb"] not in NOTIFICATION_VERBS:
            logger.error(
                "push_inbox_items: verb %r is not registered in NOTIFICATION_VERBS — "
                "dropping this notification instead of writing an unattributed row.",
                row["verb"],
            )
            continue
        good_rows.append(
            {**row, "event_type": verb_event_type(row["verb"]), "app": verb_app(row["verb"])}
        )
    if not good_rows:
        return []

    try:
        items = InboxItem.objects.bulk_create([InboxItem(**row) for row in good_rows])
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
                "app": item.app,
                "resource_name": item.resource_name,
                "board_id": item.board_id,
                "board_name": item.board_name,
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
    board_name = ""
    if task is not None:
        meta.update(
            {
                "task_id": str(task.id),
                "task_title": task.title,
                "board_id": str(task.board_id),
            }
        )
        resource_name = task.title
        board_id = str(task.board_id)
        board_name = task.board.name if task.board_id else ""

    push_inbox_items(
        [
            {
                "user": recipient,
                "workspace": workspace,
                "actor_id": str(actor.id),
                "actor_name": actor.full_name or actor.email,
                "verb": verb,
                "resource_name": resource_name,
                "board_id": board_id,
                "board_name": board_name,
                "meta": meta,
            }
        ]
    )


def _queue_chat_notification(workspace_id, verb, actor_id, task_id=None, resource=None):
    """Queue Teams / Google Chat fan-out (Celery, off the request path).

    Internal — reached only through broadcast(); the EVENTS registry decides
    which events have a chat surface.
    """
    try:
        from integrations.tasks import send_chat_notification

        send_chat_notification.delay(
            str(workspace_id),
            verb,
            str(actor_id),
            task_id=str(task_id) if task_id else None,
            resource=_json_safe(resource) if resource else None,
        )
    except Exception as exc:
        logger.warning("chat fan-out enqueue failed verb=%s: %s", verb, exc)
