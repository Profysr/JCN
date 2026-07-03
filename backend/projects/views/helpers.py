import logging

from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

logger = logging.getLogger(__name__)
from django.shortcuts import get_object_or_404
from django.db import models as django_models
from django.http import HttpResponse
from django.db.models import Count, Sum, Avg, Min, Max, F, Q, Prefetch
from django.utils import timezone
from core.events import broadcast, notify
from workspaces.models import Workspace, WorkspaceMember
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


def get_workspace_for_user(workspace_id, user):
    return get_object_or_404(Workspace, id=workspace_id, members__user=user)


# ── Shared object-lookup helpers ──────────────────────────────────────────────
def _get_board(workspace_id, board_id, user):
    """Return a Board that belongs to a workspace the user is a member of."""
    workspace = get_workspace_for_user(workspace_id, user)
    return get_object_or_404(Board, id=board_id, workspace=workspace)


def _get_task(workspace_id, board_id, task_id, user, *, qs=None):
    """Return a Task within the given board. Pass qs= to attach eager-loading."""
    board = _get_board(workspace_id, board_id, user)
    base = qs if qs is not None else Task.objects
    return get_object_or_404(base, id=task_id, board=board)


def _get_subtask(workspace_id, board_id, task_id, subtask_id, user):
    task = _get_task(workspace_id, board_id, task_id, user)
    return get_object_or_404(SubTask, id=subtask_id, task=task)


def _task_list_qs():
    """Queryset for task card/list endpoints.

    select_related("assignee") only — sprint_id is a stored FK column (no join
    needed), status_id same. blocked_by_deps and sprint dropped: TaskCardSerializer
    only exposes their IDs, which come from stored FK columns.

    Annotations cover exactly what TaskCardSerializer reads. _done_child_count
    and _comment_count are omitted — they are not fields on TaskCardSerializer,
    so annotating them was wasted DB work on every list GET.
    """
    from django.db.models import Count, Q as DQ

    return (
        Task.objects.select_related("assignee")
        .prefetch_related("labels")
        .annotate(
            _child_count=Count("children", distinct=True),
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
        "blocked_by_deps",
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
                "task_assigned",
                task.board.workspace,
                task,
            )
            broadcast(
                task.board.workspace_id,
                "task.assigned",
                {
                    "task_id": str(task.id),
                    "board_id": str(task.board_id),
                    "assignee_id": str(task.assignee_id),
                },
                task_id=task.id,
                actor_id=user.id,
            )

    if not logged_any:
        log_activity(task, user, TaskActivity.Verb.UPDATED)


# NOTE: real-time fan-out (broadcast / broadcast_to_user / notify / webhooks)
# lives in core/events.py — import from there. Permission guards
# (_require_board_perm / _require_board_admin / _is_workspace_admin) live in
# projects/permissions.py. This module keeps only query/lookup helpers.
def log_activity(task, actor, verb, meta=None):
    TaskActivity.objects.create(task=task, actor=actor, verb=verb, meta=meta or {})
