from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import PermissionDenied
from django.shortcuts import get_object_or_404
from django.db import models as django_models
from django.http import HttpResponse
from django.db.models import Count, Sum, Avg, Min, Max, F, Q, Prefetch
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from workspaces.models import Workspace, WorkspaceMember, InboxItem
from core.fields import parse_id, format_id
import datetime
import csv
import re
from ..models import (
    Board,
    TaskStatus,
    Task,
    SubTask,
    TaskComment,
    TaskActivity,
    Label,
    BoardField,
    TaskFieldValue,
    SavedView,
    Sprint,
    TaskAttachment,
    TaskDependency,
    TaskTemplate,
    WikiPage,
    WikiRevision,
    Document,
    Form,
    FormField,
    FormSubmission,
    AutomationRule,
    AutomationLog,
    BoardMember,
    UserPresence,
    CommentReaction,
    Approval,
    ApprovalReviewer,
    Objective,
    KeyResult,
)
from ..serializers import (
    BoardSerializer,
    BoardMiniSerializer,
    PortfolioBoardSerializer,
    TaskStatusSerializer,
    BulkStatusUpdateSerializer,
    TaskSerializer,
    TaskDetailSerializer,
    SubTaskSerializer,
    TaskCommentSerializer,
    TaskActivitySerializer,
    LabelSerializer,
    TaskSearchSerializer,
    BoardSearchSerializer,
    BoardFieldSerializer,
    TaskFieldValueSerializer,
    SavedViewSerializer,
    SprintSerializer,
    TaskAttachmentSerializer,
    MinimalTaskSerializer,
    TaskDependencySerializer,
    TaskTemplateSerializer,
    WikiPageSerializer,
    WikiRevisionSerializer,
    DocumentSerializer,
    FormSerializer,
    FormFieldSerializer,
    FormSubmissionSerializer,
    PublicFormSerializer,
    AutomationRuleSerializer,
    AutomationLogSerializer,
    BoardMemberSerializer,
    MyWorkTaskSerializer,
    UserPresenceSerializer,
    CommentReactionSerializer,
    ApprovalSerializer,
    ApprovalReviewerSerializer,
    ObjectiveSerializer,
    KeyResultSerializer,
    KeyResultLinkedTaskSerializer,
)
from ..permissions import has_project_permission, log_audit


def _parse_pk(value):
    """Accepts a prefixed ID (e.g. 'brd_018e...') or a plain UUID string."""
    try:
        return parse_id(value)
    except (ValueError, AttributeError, TypeError):
        return value


def get_workspace_for_user(workspace_id, user):
    return get_object_or_404(Workspace, id=_parse_pk(workspace_id), members__user=user)


def _is_workspace_admin(workspace, user):
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role=WorkspaceMember.Role.ADMIN
    ).exists()


# ── Shared object-lookup helpers ──────────────────────────────────────────────
def _get_board(workspace_id, board_id, user):
    """Return a Board that belongs to a workspace the user is a member of."""
    workspace = get_workspace_for_user(workspace_id, user)
    return get_object_or_404(Board, id=_parse_pk(board_id), workspace=workspace)


def _get_task(workspace_id, board_id, task_id, user, *, qs=None):
    """Return a Task within the given board. Pass qs= to attach eager-loading."""
    board = _get_board(workspace_id, board_id, user)
    base = qs if qs is not None else Task.objects
    return get_object_or_404(base, id=_parse_pk(task_id), board=board)


def _get_subtask(workspace_id, board_id, task_id, subtask_id, user):
    task = _get_task(workspace_id, board_id, task_id, user)
    return get_object_or_404(SubTask, id=subtask_id, task=task)


def _task_list_qs():
    """Queryset for task card/list endpoints.

    Annotations compute all five count fields that TaskCardSerializer renders
    so no per-task COUNT queries fire. prefetch_related("subtasks") and
    ("comments") are intentionally absent — .count() bypasses the prefetch
    cache and would fire anyway.
    """
    from django.db.models import Count, Q as DQ

    return (
        Task.objects.select_related("assignee", "sprint")
        .prefetch_related("labels", "blocked_by_deps")
        .annotate(
            _subtask_count=Count("subtasks", distinct=True),
            _done_subtask_count=Count(
                "subtasks", filter=DQ(subtasks__is_done=True), distinct=True
            ),
            _pending_approval_count=Count(
                "approvals",
                filter=DQ(approvals__status__in=["pending", "changes_requested"]),
                distinct=True,
            ),
            _approved_approval_count=Count(
                "approvals",
                filter=DQ(approvals__status="approved"),
                distinct=True,
            ),
        )
    )


def _apply_task_filters(qs, params, user=None):
    """Apply FilterBar query params to a Task queryset. All params are optional."""
    search = params.get("search", "").strip()
    if search:
        qs = qs.filter(title__icontains=search)

    priorities = params.getlist("priority")
    if priorities:
        qs = qs.filter(priority__in=priorities)

    assignees = params.getlist("assignee")
    if assignees:
        qs = qs.filter(assignee_id__in=assignees)

    labels = params.getlist("label")
    if labels:
        qs = qs.filter(labels__id__in=labels).distinct()

    types = params.getlist("type")
    if types:
        qs = qs.filter(task_type__in=types)

    due = params.getlist("due")
    if due:
        today = timezone.now().date()
        week_end = today + datetime.timedelta(days=7)
        due_q = Q()
        if "overdue" in due:
            due_q |= Q(due_date__lt=today, due_date__isnull=False)
        if "today" in due:
            due_q |= Q(due_date=today)
        if "this_week" in due:
            due_q |= Q(due_date__gte=today, due_date__lte=week_end)
        if "no_date" in due:
            due_q |= Q(due_date__isnull=True)
        qs = qs.filter(due_q)

    if params.get("pending_approval") == "true" and user:
        qs = qs.filter(
            approvals__reviewer__user=user,
            approvals__status__in=["pending", "changes_requested"],
        ).distinct()

    return qs


def _task_detail_qs():
    """Queryset for the task detail endpoint — core fields + field_values + ancestors."""
    return Task.objects.select_related(
        "status", "assignee", "created_by", "sprint", "parent"
    ).prefetch_related(
        "labels",
        "field_values__field",
    )


def _log_task_patch_changes(
    task, user, request_data, old_status, old_priority, old_assignee
):
    """Store an audit log event and task activity who did and what?"""
    logged_any = False

    if "status_id" in request_data and task.status != old_status:
        log_activity(
            task,
            user,
            TaskActivity.Verb.STATUS,
            {
                "from": old_status.name if old_status else None,
                "to": task.status.name if task.status else None,
            },
        )
        logged_any = True

    if "priority" in request_data and task.priority != old_priority:
        log_activity(
            task,
            user,
            TaskActivity.Verb.PRIORITY,
            {
                "from": old_priority,
                "to": task.priority,
            },
        )
        logged_any = True

    if "assignee_id" in request_data and task.assignee != old_assignee:
        log_activity(
            task,
            user,
            TaskActivity.Verb.ASSIGNED,
            {
                "to": task.assignee.full_name if task.assignee else None,
            },
        )
        logged_any = True
        if task.assignee and task.assignee != user:
            notify(
                task.assignee,
                user,
                InboxItem.Verb.TASK_ASSIGNED,
                task.board.workspace,
                task,
            )

    if not logged_any:
        log_activity(task, user, TaskActivity.Verb.UPDATED)


# ── Shared object-lookup helpers ✅──────────────────────────────────────────────
def broadcast(workspace_id, event_type, data):
    """Push a real-time event to all WebSocket clients in this workspace."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"workspace_{workspace_id}",
        {"type": "workspace.event", "data": {"type": event_type, "payload": data}},
    )
    # v4.5.0 — also fan out to registered webhooks
    _fire_webhooks(workspace_id, event_type, data)


def _fire_webhooks(workspace_id, event_type, data):
    """Queue webhook deliveries for all active webhooks subscribed to this event."""
    try:
        from workspaces.models import Webhook
        from workspaces.tasks import deliver_webhook

        # Translate internal event names to the public webhook API surface.
        # Several internal events (e.g. task.moved, tasks.bulk_updated) collapse into a single public event so external consumers get a stable contract.
        # Events absent from this map (presence.updated, reaction.updated, etc.) are internal-only and must never be forwarded to external endpoints.
        _EVENT_MAP = {
            "task.created": "task.created",
            "task.updated": "task.updated",
            "task.moved": "task.updated",  # move is an update to external consumers
            "task.deleted": "task.deleted",
            "task.commented": "task.commented",
            "tasks.bulk_updated": "task.updated",
            "tasks.bulk_deleted": "task.deleted",
            "status.updated": "status.updated",
            "sprint.started": "sprint.started",
            "sprint.completed": "sprint.completed",
        }

        webhook_event = _EVENT_MAP.get(event_type)
        if not webhook_event:
            # This event is internal-only — nothing to deliver.
            return

        # Only fetch webhooks that are active; inactive ones are soft-disabled.
        hooks = Webhook.objects.filter(
            workspace__id=_parse_pk(workspace_id),
            is_active=True,
        )

        payload = {"event": webhook_event, "workspace": workspace_id, "data": data}

        for hook in hooks:
            # hook.events is a JSON list of subscribed event types.
            # An empty list means "all events" — the hook owner opted into everything.
            if not hook.events or webhook_event in hook.events:
                # Queue the HTTP delivery as a Celery task so the outbound
                # network call never blocks or slows down the API response.
                deliver_webhook.delay(str(hook.id), webhook_event, payload)

    except Exception:
        pass  # never break the main request path


def log_activity(task, actor, verb, meta=None):
    TaskActivity.objects.create(task=task, actor=actor, verb=verb, meta=meta or {})


def broadcast_to_user(user_id, event_type, data):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"user_{user_id}",
        {"type": "user.notification", "data": {"type": event_type, "payload": data}},
    )


_VERB_TO_EVENT_TYPE = {
    InboxItem.Verb.TASK_ASSIGNED: "assigned",
    InboxItem.Verb.TASK_COMMENTED: "commented",
    InboxItem.Verb.TASK_MENTIONED: "mentioned",
    InboxItem.Verb.APPROVAL_REQUESTED: "approved",
}


def notify(recipient, actor, verb, workspace, task):
    """Create an InboxItem and push to the recipient's WS group. No-op if actor == recipient."""
    if recipient == actor:
        return

    meta = {
        "task_id": str(task.id),
        "task_title": task.title,
        "board_id": str(task.board_id),
        "workspace_id": format_id(workspace.PREFIX, workspace.id),
    }

    inbox_item = InboxItem.objects.create(
        user=recipient,
        workspace=workspace,
        actor_id=str(actor.id),
        actor_name=actor.full_name or actor.email,
        verb=verb,
        event_type=_VERB_TO_EVENT_TYPE.get(verb, "assigned"),
        resource_name=task.title,
        board_id=str(task.board_id),
        project_name=task.board.name if task.board_id else "",
        meta=meta,
    )

    broadcast_to_user(
        str(recipient.id),
        "notification.created",
        {
            "id": format_id(inbox_item.PREFIX, inbox_item.id),
            "actor_id": str(actor.id),
            "actor_name": actor.full_name or actor.email,
            "verb": verb,
            "event_type": _VERB_TO_EVENT_TYPE.get(verb, "assigned"),
            "resource_name": task.title,
            "board_id": str(task.board_id),
            "project_name": task.board.name if task.board_id else "",
            "meta": meta,
            "status": "unread",
            "created_at": inbox_item.created_at.isoformat(),
        },
    )


_PERM_MSG = {"admin": "Admin role required.", "edit": "Editor role required."}


def _require_board_perm(user, board, role):
    if not has_project_permission(user, board, role):
        raise PermissionDenied(
            _PERM_MSG.get(role, f"{role.capitalize()} role required.")
        )


def _require_board_admin(request, workspace_id, board_id):
    """Return (workspace, board) or raise 403/404."""
    workspace = get_workspace_for_user(workspace_id, request.user)
    board = get_object_or_404(Board, id=board_id, workspace=workspace)
    _require_board_perm(request.user, board, "admin")
    return workspace, board
