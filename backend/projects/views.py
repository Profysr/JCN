from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import models as django_models
from django.http import HttpResponse
from django.db.models import Count, Sum, Avg, Min, Max, F, Q, Prefetch
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from workspaces.models import Workspace, WorkspaceMember, Notification
from core.fields import parse_id, format_id
import datetime
import csv
import re


def _parse_pk(value):
    """Accepts a prefixed ID (e.g. 'brd_018e...') or a plain UUID string."""
    try:
        return parse_id(value)
    except (ValueError, AttributeError, TypeError):
        return value


from .models import (
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
from .serializers import (
    BoardSerializer, BoardMiniSerializer, PortfolioBoardSerializer,
    TaskStatusSerializer,
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
from .permissions import has_project_permission, get_effective_role, log_audit

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
    base  = qs if qs is not None else Task.objects
    return get_object_or_404(base, id=_parse_pk(task_id), board=board)


def _get_subtask(workspace_id, board_id, task_id, subtask_id, user):
    task = _get_task(workspace_id, board_id, task_id, user)
    return get_object_or_404(SubTask, id=subtask_id, task=task)


def _task_list_qs():
    """Queryset for task list endpoints — no activity/comment detail (too heavy)."""
    return Task.objects.select_related(
        "status", "assignee", "created_by", "sprint"
    ).prefetch_related("subtasks", "comments", "labels", "blocked_by_deps")


def _task_detail_qs():
    """Queryset for single-task endpoints — includes full history and field values."""
    return Task.objects.select_related(
        "status", "assignee", "created_by", "sprint"
    ).prefetch_related(
        "subtasks",
        "comments__author",
        "activities__actor",
        "labels",
        "field_values__field",
    )


def _log_task_patch_changes(task, user, request_data, old_status, old_priority, old_assignee):
    """Log the most significant change after a PATCH and fire assignment notifications."""
    if "status_id" in request_data and task.status != old_status:
        log_activity(task, user, TaskActivity.Verb.STATUS, {
            "from": old_status.name if old_status else None,
            "to":   task.status.name if task.status else None,
        })
    elif "priority" in request_data and task.priority != old_priority:
        log_activity(task, user, TaskActivity.Verb.PRIORITY, {
            "from": old_priority,
            "to":   task.priority,
        })
    elif "assignee_id" in request_data and task.assignee != old_assignee:
        log_activity(task, user, TaskActivity.Verb.ASSIGNED, {
            "to": task.assignee.full_name if task.assignee else None,
        })
        if task.assignee and task.assignee != user:
            notify(task.assignee, user, Notification.Verb.TASK_ASSIGNED, task.board.workspace, task)
    else:
        log_activity(task, user, TaskActivity.Verb.UPDATED)


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

        # Map internal event names to public webhook event names
        _EVENT_MAP = {
            "task.created": "task.created",
            "task.updated": "task.updated",
            "task.moved": "task.updated",
            "task.deleted": "task.deleted",
            "task.commented": "task.commented",
            "tasks.bulk_updated": "task.updated",
            "tasks.bulk_deleted": "task.deleted",
            "sprint.started": "sprint.started",
            "sprint.completed": "sprint.completed",
        }
        webhook_event = _EVENT_MAP.get(event_type)
        if not webhook_event:
            return

        hooks = Webhook.objects.filter(
            workspace__id=_parse_pk(workspace_id),
            is_active=True,
        )
        payload = {"event": webhook_event, "workspace": workspace_id, "data": data}
        for hook in hooks:
            if not hook.events or webhook_event in hook.events:
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
    Notification.Verb.TASK_ASSIGNED: "assigned",
    Notification.Verb.TASK_COMMENTED: "commented",
    Notification.Verb.TASK_MENTIONED: "mentioned",
    Notification.Verb.APPROVAL_REQUESTED: "approved",
}


def notify(recipient, actor, verb, workspace, task):
    """Create a Notification + InboxItem and push to the recipient's WS group. No-op if actor == recipient."""
    if recipient == actor:
        return
    meta = {
        "task_id": str(task.id),
        "task_title": task.title,
        "board_id": str(task.board_id),
        "workspace_id": format_id(workspace.PREFIX, workspace.id),
    }
    notif = Notification.objects.create(
        recipient=recipient, actor=actor, verb=verb, workspace=workspace, meta=meta
    )

    # v3.7.0 — create persistent InboxItem
    from workspaces.models import InboxItem

    InboxItem.objects.create(
        user=recipient,
        workspace=workspace,
        notification=notif,
        actor_id=str(actor.id),
        actor_name=actor.full_name or actor.email,
        verb=verb,
        event_type=_VERB_TO_EVENT_TYPE.get(verb, "assigned"),
        resource_name=task.title,
        project_id=str(task.board_id),
        project_name=task.board.name if task.board_id else "",
        meta=meta,
    )

    broadcast_to_user(
        str(recipient.id),
        "notification.created",
        {
            "id": str(notif.id),
            "actor": {
                "id": str(actor.id),
                "full_name": actor.full_name,
                "email": actor.email,
            },
            "verb": notif.verb,
            "meta": notif.meta,
            "read": False,
            "created_at": notif.created_at.isoformat(),
        },
    )

    # v4.3.0 — fan out to Slack / Teams / Google Chat
    try:
        from integrations.services import fanout_notification

        fanout_notification(workspace, verb, task, actor)
    except Exception:
        pass  # never break the main request path


# ── Boards ✅─────────────────────────────────────────────────────────────────
class BoardListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        boards = Board.objects.for_user(workspace, request.user).filter(status=Board.Status.ACTIVE)
        return Response(BoardMiniSerializer(boards, many=True).data)

    def post(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        serializer = BoardSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        board = Board.objects.for_user(workspace, request.user).get(id=created.id)
        return Response(
            BoardSerializer(board, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

class BoardDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_board(self, workspace_id, project_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(
            Board.objects.for_user(workspace, user), id=_parse_pk(project_id)
        )

    def get(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        return Response(BoardSerializer(board, context={"request": request}).data)

    def patch(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        serializer = BoardSerializer(
            board,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": board.workspace},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        if not _is_workspace_admin(board.workspace, request.user):
            return Response(
                {"detail": "Only workspace admins can archive boards."},
                status=status.HTTP_403_FORBIDDEN,
            )
        board.status = Board.Status.ARCHIVED
        board.save(update_fields=["status"])
        return Response(status=status.HTTP_204_NO_CONTENT)

# ── v3.4.0 — Portfolio ✅───────────────────────────────────────────────────────
class PortfolioView(APIView):
    """GET /portfolio/ — cross-project health stats for a workspace."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        today = timezone.now().date()
        boards = (
            Board.objects.for_user(workspace, request.user)
            .filter(status=Board.Status.ACTIVE)
            .annotate(
                overdue_tasks=Count(
                    'tasks',
                    filter=Q(tasks__due_date__lt=today, tasks__status__is_done=False),
                    distinct=True,
                ),
            )
            .prefetch_related(
                Prefetch(
                    'sprints',
                    queryset=Sprint.objects.filter(status='active'),
                    to_attr='active_sprints',
                )
            )
        )
        return Response(PortfolioBoardSerializer(boards, many=True).data)

# ── Task Statuses (Kanban columns) ✅───────────────────────────────────────────
class TaskStatusListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        return Response(TaskStatusSerializer(board.statuses.all(), many=True).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = TaskStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # 1. Sort columns from highest order to lowest (e.g., 3, 2, 1)
        # 2. Grab only the 'order' numbers as a flat list: [3, 2, 1]
        # 3. Take the first item (the highest number): 3
        # 4. Fallback: If the board has 0 columns, start at 0
        # 5. Add 1 to get the next position: 4
        next_order = (
            board.statuses.order_by("-order").values_list("order", flat=True).first() or 0
        ) + 1
        serializer.save(board=board, order=next_order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskStatusDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_status(self, workspace_id, project_id, status_id, user):
        board = _get_board(workspace_id, project_id, user)
        return get_object_or_404(TaskStatus, id=status_id, board=board)

    def patch(self, request, workspace_id, project_id, status_id):
        task_status = self._get_status(workspace_id, project_id, status_id, request.user)
        serializer = TaskStatusSerializer(task_status, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # Enforce single-done: clear any other done column on this board first
        if serializer.validated_data.get("is_done"):
            task_status.board.statuses.exclude(id=task_status.id).filter(is_done=True).update(is_done=False)
        serializer.save()
        broadcast(workspace_id, "status.updated", serializer.data)
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, status_id):
        task_status = self._get_status(workspace_id, project_id, status_id, request.user)
        if task_status.tasks.exists():
            return Response(
                {"error": "Cannot delete a column that still has tasks. Move tasks first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task_status.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskStatusReorderView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        ordered_ids = request.data.get("ids", [])
        if not isinstance(ordered_ids, list):
            return Response({"error": "ids must be a list"}, status=status.HTTP_400_BAD_REQUEST)

        statuses = {str(s.id): s for s in board.statuses.all()}
        updates = []
        for i, sid in enumerate(ordered_ids):
            s = statuses.get(str(sid))
            if s:
                s.order = i
                updates.append(s)

        TaskStatus.objects.bulk_update(updates, ["order"])
        return Response({"reordered": True})


# ── Tasks ─────────────────────────────────────────────────────────────────────
class TaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        tasks = _task_list_qs().filter(board=board)

        sprint_param = request.query_params.get("sprint")
        if sprint_param == "none":
            tasks = tasks.filter(sprint__isnull=True)
        elif sprint_param:
            tasks = tasks.filter(sprint_id=sprint_param)

        # Optional date-range filter (used by calendar view)
        start = request.query_params.get("start")
        end   = request.query_params.get("end")
        if start:
            tasks = tasks.filter(due_date__gte=start)
        if end:
            tasks = tasks.filter(due_date__lte=end)

        return Response(TaskSerializer(tasks, many=True, context={"request": request}).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = TaskSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(board=board)
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        if task.assignee and task.assignee != request.user:
            notify(task.assignee, request.user, Notification.Verb.TASK_ASSIGNED, board.workspace, task)
        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_id, "task.created", data)
        return Response(data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user, qs=_task_detail_qs())
        return Response(TaskDetailSerializer(task, context={"request": request}).data)

    def patch(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user, qs=_task_detail_qs())

        # Optimistic locking: reject writes that are based on a stale version
        incoming_version = request.data.get("version")
        if incoming_version is not None and int(incoming_version) != task.version:
            return Response(
                {
                    "conflict": True,
                    "current_version": task.version,
                    "updated_at": task.updated_at.isoformat(),
                },
                status=status.HTTP_409_CONFLICT,
            )

        old_status   = task.status
        old_priority = task.priority
        old_assignee = task.assignee

        serializer = TaskSerializer(task, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        Task.objects.filter(pk=task.pk).update(version=task.version + 1)
        task.refresh_from_db()

        _log_task_patch_changes(task, request.user, request.data, old_status, old_priority, old_assignee)

        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_id, "task.updated", data)
        return Response(data)

    def delete(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        task_id_str = str(task.id)
        task.delete()
        broadcast(workspace_id, "task.deleted", {"id": task_id_str, "board_id": str(project_id)})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Move (Kanban drag & drop) ────────────────────────────────────────────
class TaskMoveView(APIView):
    """PATCH: atomically update a task's status column and sort order."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, project_id, task_id):
        board      = _get_board(workspace_id, project_id, request.user)
        task       = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        old_status = task.status

        status_id = request.data.get("status_id")
        order     = request.data.get("order")

        if status_id is not None:
            task_status = get_object_or_404(TaskStatus, id=status_id, board=board)
            # Approval gate: block move to a done column while any approval is still pending.
            # (changes_requested / rejected are closed states — those are fine to pass.)
            if task_status.is_done and task.approvals.filter(status=Approval.Status.PENDING).exists():
                return Response(
                    {
                        "approval_required": True,
                        "detail": "This task has pending approvals. Resolve them before marking it done.",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            task.status = task_status
        if order is not None:
            task.order = order

        task.save(update_fields=["status", "order", "updated_at"])

        if task.status != old_status:
            log_activity(task, request.user, TaskActivity.Verb.STATUS, {
                "from": old_status.name if old_status else None,
                "to":   task.status.name if task.status else None,
            })

        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_id, "task.moved", data)
        return Response(data)


# ── Subtasks ──────────────────────────────────────────────────────────────────
class SubTaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        return Response(SubTaskSerializer(task.subtasks.all(), many=True).data)

    def post(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        serializer = SubTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subtask = serializer.save(task=task)
        log_activity(task, request.user, TaskActivity.Verb.SUBTASK, {"title": subtask.title})
        return Response(SubTaskSerializer(subtask).data, status=status.HTTP_201_CREATED)


class SubTaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, project_id, task_id, subtask_id):
        subtask = _get_subtask(workspace_id, project_id, task_id, subtask_id, request.user)
        serializer = SubTaskSerializer(subtask, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, task_id, subtask_id):
        subtask = _get_subtask(workspace_id, project_id, task_id, subtask_id, request.user)
        subtask.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Activity ──────────────────────────────────────────────────────────────────
class TaskActivityListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        activities = task.activities.select_related("actor").all()
        return Response(TaskActivitySerializer(activities, many=True).data)


# ── Comments ──────────────────────────────────────────────────────────────────
class TaskCommentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        return Response(
            TaskCommentSerializer(
                task.comments.select_related("author").all(),
                many=True,
                context={"request": request},
            ).data
        )

    def post(self, request, workspace_id, project_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        task = _get_task(workspace_id, project_id, task_id, request.user)
        serializer = TaskCommentSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(task=task)
        log_activity(task, request.user, TaskActivity.Verb.COMMENTED)
        # Notify assignee and task creator
        recipients = {
            u for u in [task.assignee, task.created_by] if u and u != request.user
        }
        for recipient in recipients:
            notify(
                recipient,
                request.user,
                Notification.Verb.TASK_COMMENTED,
                workspace,
                task,
            )
        # Parse @mentions and notify mentioned users
        mentions = re.findall(r"@(\w+)", comment.body)
        if mentions:
            from accounts.models import User as UserModel

            workspace_users = UserModel.objects.filter(
                workspace_memberships__workspace=workspace
            ).exclude(id=request.user.id)
            for mention in set(mentions):
                for user in workspace_users:
                    name_parts = (user.full_name or "").lower().split()
                    email_prefix = user.email.split("@")[0].lower()
                    if mention.lower() in name_parts or mention.lower() == email_prefix:
                        if user not in recipients:
                            notify(
                                user,
                                request.user,
                                Notification.Verb.TASK_MENTIONED,
                                workspace,
                                task,
                            )
                            recipients.add(user)
        data = TaskCommentSerializer(comment, context={"request": request}).data
        broadcast(
            workspace_id,
            "comment.created",
            {
                "task_id": str(task.id),
                "project_id": str(task.board_id),
                "comment": data,
            },
        )
        return Response(data, status=status.HTTP_201_CREATED)


class TaskCommentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_comment(self, workspace_id, project_id, task_id, comment_id, user):
        task = _get_task(workspace_id, project_id, task_id, user)
        return get_object_or_404(TaskComment, id=comment_id, task=task)

    def patch(self, request, workspace_id, project_id, task_id, comment_id):
        comment = self.get_comment(
            workspace_id, project_id, task_id, comment_id, request.user
        )
        if comment.author != request.user:
            return Response(
                {"detail": "You can only edit your own comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TaskCommentSerializer(
            comment, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, task_id, comment_id):
        comment = self.get_comment(
            workspace_id, project_id, task_id, comment_id, request.user
        )
        if comment.author != request.user:
            return Response(
                {"detail": "You can only delete your own comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment_id_str = str(comment.id)
        comment.delete()
        broadcast(
            workspace_id,
            "comment.deleted",
            {
                "task_id": str(task_id),
                "project_id": str(project_id),
                "comment_id": comment_id_str,
            },
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Labels ────────────────────────────────────────────────────────────────────


class LabelListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        return Response(LabelSerializer(board.labels.all(), many=True).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = LabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        label = serializer.save(board=board)
        return Response(LabelSerializer(label).data, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_label(self, workspace_id, project_id, label_id, user):
        board = _get_board(workspace_id, project_id, user)
        return get_object_or_404(Label, id=label_id, board=board)

    def patch(self, request, workspace_id, project_id, label_id):
        label = self.get_label(workspace_id, project_id, label_id, request.user)
        serializer = LabelSerializer(label, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, label_id):
        label = self.get_label(workspace_id, project_id, label_id, request.user)
        label.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# ── Global Search ─────────────────────────────────────────────────────────────
class GlobalSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # ── Query params ──────────────────────────────────────────────────────
        q = request.query_params.get("q", "").strip()
        task_type = request.query_params.get("task_type", "").strip()
        assignee = request.query_params.get("assignee", "").strip()
        priority = request.query_params.get("priority", "").strip()
        overdue = request.query_params.get("overdue", "").lower() == "true"
        today_only = request.query_params.get("today", "").lower() == "true"

        has_any = (
            len(q) >= 2 or task_type or assignee or priority or overdue or today_only
        )
        if not has_any:
            return Response({"tasks": [], "boards": []})

        workspace_ids = WorkspaceMember.objects.filter(user=request.user).values_list(
            "workspace_id", flat=True
        )

        tasks = Task.objects.filter(
            board__workspace_id__in=workspace_ids,
        ).select_related("board__workspace", "status", "assignee")

        # Text search — title + description
        if len(q) >= 2:
            tasks = tasks.filter(
                django_models.Q(title__icontains=q)
                | django_models.Q(description__icontains=q)
            )

        # Dedicated filters
        if task_type:
            tasks = tasks.filter(task_type__icontains=task_type)
        if assignee:
            tasks = tasks.filter(
                django_models.Q(assignee__full_name__icontains=assignee)
                | django_models.Q(assignee__email__icontains=assignee)
            )
        if priority:
            tasks = tasks.filter(priority__icontains=priority)
        if overdue:
            today = timezone.now().date()
            tasks = tasks.filter(due_date__lt=today, status__is_done=False)
        if today_only:
            today = timezone.now().date()
            tasks = tasks.filter(due_date=today)

        tasks = tasks[:15]

        projects = (
            (
                Board.objects.filter(
                    workspace_id__in=workspace_ids, name__icontains=q
                ).select_related("workspace")[:5]
            )
            if len(q) >= 2
            else []
        )

        return Response(
            {
                "tasks": TaskSearchSerializer(tasks, many=True).data,
                "boards": BoardSearchSerializer(projects, many=True).data,
            }
        )


# ── Custom Fields (v0.8.0) ────────────────────────────────────────────────────
class BoardFieldListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        return Response(BoardFieldSerializer(board.fields.all(), many=True).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = BoardFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(board=board, order=board.fields.count())
        return Response(
            BoardFieldSerializer(field).data, status=status.HTTP_201_CREATED
        )


class BoardFieldDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_field(self, workspace_id, project_id, field_id, user):
        board = _get_board(workspace_id, project_id, user)
        return get_object_or_404(BoardField, id=field_id, board=board)

    def patch(self, request, workspace_id, project_id, field_id):
        field = self.get_field(workspace_id, project_id, field_id, request.user)
        serializer = BoardFieldSerializer(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, field_id):
        field = self.get_field(workspace_id, project_id, field_id, request.user)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskFieldValueView(APIView):
    """Upsert a single custom field value for a task."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id, task_id):
        task = _get_task(workspace_id, project_id, task_id, request.user)
        serializer = TaskFieldValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field_value = serializer.save(task=task)
        return Response(TaskFieldValueSerializer(field_value).data)


# ── Saved Views (v0.8.0) ──────────────────────────────────────────────────────


class SavedViewListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        views = board.saved_views.filter(user=request.user)
        return Response(SavedViewSerializer(views, many=True).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = SavedViewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        view = serializer.save(board=board, user=request.user)
        return Response(SavedViewSerializer(view).data, status=status.HTTP_201_CREATED)


class SavedViewDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_view(self, workspace_id, project_id, view_id, user):
        board = _get_board(workspace_id, project_id, user)
        return get_object_or_404(SavedView, id=view_id, board=board, user=user)

    def delete(self, request, workspace_id, project_id, view_id):
        view = self.get_view(workspace_id, project_id, view_id, request.user)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Sprints (v0.9.0) ─────────────────────────────────────────────────────────


class SprintListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        return Response(SprintSerializer(board.sprints.all(), many=True).data)

    def post(self, request, workspace_id, project_id):
        board = _get_board(workspace_id, project_id, request.user)
        serializer = SprintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sprint = serializer.save(board=board)
        return Response(SprintSerializer(sprint).data, status=status.HTTP_201_CREATED)


class SprintDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_sprint(self, workspace_id, project_id, sprint_id, user):
        board = _get_board(workspace_id, project_id, user)
        return get_object_or_404(Sprint, id=sprint_id, board=board)

    def get(self, request, workspace_id, project_id, sprint_id):
        sprint = self.get_sprint(workspace_id, project_id, sprint_id, request.user)
        return Response(SprintSerializer(sprint).data)

    def patch(self, request, workspace_id, project_id, sprint_id):
        sprint = self.get_sprint(workspace_id, project_id, sprint_id, request.user)
        serializer = SprintSerializer(sprint, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, sprint_id):
        sprint = self.get_sprint(workspace_id, project_id, sprint_id, request.user)
        sprint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SprintBurndownView(APIView):
    """Returns ideal vs actual task-completion data for a sprint's burndown chart."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, sprint_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        sprint = get_object_or_404(Sprint, id=sprint_id, board=board)

        if not sprint.start_date or not sprint.end_date:
            return Response(
                {"error": "Sprint dates not set."}, status=status.HTTP_400_BAD_REQUEST
            )

        done_status = board.statuses.order_by("-order").first()
        sprint_tasks = sprint.tasks.all()
        total = sprint_tasks.count()

        today = datetime.date.today()
        days, ideal, actual = [], [], []
        total_days = max((sprint.end_date - sprint.start_date).days, 1)
        current = sprint.start_date
        idx = 0

        while current <= sprint.end_date:
            days.append(current.strftime("%b %d"))
            ideal.append(round(total * (1 - idx / total_days), 1))

            if current <= today:
                # Tasks completed (moved to done status) by end of this day
                done_by_day = (
                    TaskActivity.objects.filter(
                        task__sprint=sprint,
                        verb=TaskActivity.Verb.STATUS,
                        created_at__date__lte=current,
                        meta__to=done_status.name if done_status else "Done",
                    )
                    .values("task")
                    .distinct()
                    .count()
                )
                actual.append(max(total - done_by_day, 0))
            else:
                actual.append(None)

            current += datetime.timedelta(days=1)
            idx += 1

        completed = (
            sprint_tasks.filter(status=done_status).count() if done_status else 0
        )
        return Response(
            {
                "total": total,
                "completed": completed,
                "remaining": total - completed,
                "days": days,
                "ideal": ideal,
                "actual": actual,
            }
        )


# ── Bulk Actions (v1.1.0) ─────────────────────────────────────────────────────


class TaskBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task_ids = request.data.get("task_ids", [])
        action = request.data.get("action", "update")
        updates = request.data.get("updates", {})

        if not task_ids:
            return Response(
                {"error": "task_ids required"}, status=status.HTTP_400_BAD_REQUEST
            )

        tasks = Task.objects.filter(id__in=task_ids, board=board)

        if action == "delete":
            count = tasks.count()
            tasks.delete()
            broadcast(
                workspace_id,
                "tasks.bulk_deleted",
                {"task_ids": task_ids, "project_id": str(project_id)},
            )
            return Response({"deleted": count})

        if action == "update":
            update_kwargs = {}
            if "status_id" in updates and updates["status_id"]:
                update_kwargs["status_id"] = updates["status_id"]
            if "priority" in updates and updates["priority"]:
                update_kwargs["priority"] = updates["priority"]
            if "assignee_id" in updates:
                update_kwargs["assignee_id"] = updates["assignee_id"] or None
            if update_kwargs:
                tasks.update(**update_kwargs)
            updated = TaskSerializer(
                tasks.select_related("status", "assignee"), many=True
            ).data
            broadcast(
                workspace_id,
                "tasks.bulk_updated",
                {"tasks": updated, "project_id": str(project_id)},
            )
            return Response({"updated": len(updated), "tasks": updated})

        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)


# ── File Attachments (v1.2.0) ─────────────────────────────────────────────────


class TaskAttachmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def _get_task(self, workspace_id, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(Task, id=_parse_pk(task_id), board=board)

    def get(self, request, workspace_id, project_id, task_id):
        task = self._get_task(workspace_id, project_id, task_id, request.user)
        return Response(
            TaskAttachmentSerializer(
                task.attachments.select_related("uploaded_by").all(),
                many=True,
                context={"request": request},
            ).data
        )

    def post(self, request, workspace_id, project_id, task_id):
        task = self._get_task(workspace_id, project_id, task_id, request.user)
        file = request.FILES.get("file")
        if not file:
            return Response(
                {"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST
            )
        if file.size > 20 * 1024 * 1024:  # 20 MB limit
            return Response(
                {"error": "File exceeds 20 MB limit"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        attachment = TaskAttachment.objects.create(
            task=task,
            file=file,
            original_name=file.name,
            file_size=file.size,
            mime_type=file.content_type or "",
            uploaded_by=request.user,
        )
        return Response(
            TaskAttachmentSerializer(attachment, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TaskAttachmentDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, project_id, task_id, attachment_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        attachment = get_object_or_404(TaskAttachment, id=attachment_id, task=task)
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Dependencies (v1.4.0) ────────────────────────────────────────────────


class TaskDependencyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_task(self, workspace_id, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(Task, id=_parse_pk(task_id), board=board), board

    def get(self, request, workspace_id, project_id, task_id):
        task, _ = self._get_task(workspace_id, project_id, task_id, request.user)
        blocked_by = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocker).data}
            for d in task.blocked_by_deps.select_related("blocker__status").all()
        ]
        blocking = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocked).data}
            for d in task.blocking_deps.select_related("blocked__status").all()
        ]
        return Response({"blocked_by": blocked_by, "blocking": blocking})

    def post(self, request, workspace_id, project_id, task_id):
        task, board = self._get_task(workspace_id, project_id, task_id, request.user)
        dep_task_id = request.data.get("task_id")
        dep_type = request.data.get("type", "blocked_by")  # "blocked_by" | "blocks"

        if not dep_task_id:
            return Response(
                {"error": "task_id required"}, status=status.HTTP_400_BAD_REQUEST
            )
        dep_task = get_object_or_404(Task, id=dep_task_id, board=board)
        if dep_task.id == task.id:
            return Response(
                {"error": "A task cannot block itself"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if dep_type == "blocked_by":
            dep, created = TaskDependency.objects.get_or_create(
                blocker=dep_task, blocked=task
            )
        else:
            dep, created = TaskDependency.objects.get_or_create(
                blocker=task, blocked=dep_task
            )

        return Response(
            {"id": str(dep.id), "created": created}, status=status.HTTP_201_CREATED
        )


class TaskDependencyDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, project_id, task_id, dep_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        dep = get_object_or_404(TaskDependency, id=dep_id)
        if dep.blocker.board_id != board.id and dep.blocked.board_id != board.id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        dep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── CSV Export (v1.7.0) ───────────────────────────────────────────────────────


class TaskExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        tasks = (
            Task.objects.filter(board=board)
            .select_related("status", "assignee", "sprint", "created_by")
            .prefetch_related("labels")
        )

        response = HttpResponse(content_type="text/csv")
        safe_name = board.name.replace(" ", "_")
        response["Content-Disposition"] = (
            f'attachment; filename="{safe_name}-tasks.csv"'
        )

        writer = csv.writer(response)
        writer.writerow(
            [
                "ID",
                "Title",
                "Status",
                "Priority",
                "Assignee",
                "Due Date",
                "Sprint",
                "Labels",
                "Created",
            ]
        )
        for task in tasks:
            writer.writerow(
                [
                    str(task.id)[:8],
                    task.title,
                    task.status.name if task.status else "",
                    task.get_priority_display(),
                    task.assignee.full_name if task.assignee else "",
                    str(task.due_date) if task.due_date else "",
                    task.sprint.name if task.sprint else "",
                    ", ".join(l.name for l in task.labels.all()),
                    task.created_at.strftime("%Y-%m-%d"),
                ]
            )
        return response


# ── v2.1.0 — Project Members & Permissions ────────────────────────────────────


def _require_board_admin(request, workspace_id, board_id):
    """Return (workspace, board) or raise 403/404."""
    workspace = get_workspace_for_user(workspace_id, request.user)
    board = get_object_or_404(Board, id=board_id, workspace=workspace)
    if not has_project_permission(request.user, board, "admin"):
        from rest_framework.exceptions import PermissionDenied

        raise PermissionDenied("Board admin role required.")
    return workspace, board


class BoardMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "view"):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        members = board.members.select_related("user")
        return Response(BoardMemberSerializer(members, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace, board = _require_board_admin(request, workspace_id, project_id)
        serializer = BoardMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save(board=board, added_by=request.user)
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.added",
            resource_type="project_member",
            resource_id=member.id,
            after={"user": str(member.user_id), "role": member.role},
        )
        return Response(
            BoardMemberSerializer(member).data, status=status.HTTP_201_CREATED
        )


class BoardMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_member(self, workspace_id, project_id, member_id, request):
        workspace, board = _require_board_admin(request, workspace_id, project_id)
        member = get_object_or_404(BoardMember, id=member_id, board=board)
        return workspace, board, member

    def patch(self, request, workspace_id, project_id, member_id):
        workspace, board, member = self._get_member(
            workspace_id, project_id, member_id, request
        )
        before_role = member.role
        new_role = request.data.get("role")
        if new_role not in [r.value for r in BoardMember.Role]:
            return Response(
                {"role": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST
            )
        member.role = new_role
        member.save(update_fields=["role"])
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.role_changed",
            resource_type="project_member",
            resource_id=member.id,
            before={"role": before_role},
            after={"role": new_role},
        )
        return Response(BoardMemberSerializer(member).data)

    def delete(self, request, workspace_id, project_id, member_id):
        workspace, _board, member = self._get_member(
            workspace_id, project_id, member_id, request
        )
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.removed",
            resource_type="project_member",
            resource_id=member.id,
            before={"user": str(member.user_id), "role": member.role},
        )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectPermissionsView(APIView):
    """Return the current user's effective role for a project — used by frontend hooks."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        role = get_effective_role(request.user, board)
        if role is None:
            return Response(
                {"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN
            )
        return Response(
            {
                "role": role,
                "can_view": has_project_permission(request.user, board, "view"),
                "can_edit": has_project_permission(request.user, board, "edit"),
                "can_delete": has_project_permission(request.user, board, "delete"),
                "can_admin": has_project_permission(request.user, board, "admin"),
            }
        )

# ── v2.4.0 — Advanced Task System ────────────────────────────────────────────
class TaskCloneView(APIView):
    """POST /tasks/:id/clone/ — deep-clone a task and return the new task."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        new_task = task.clone(created_by=request.user)
        log_activity(
            new_task,
            request.user,
            TaskActivity.Verb.CREATED,
            {"cloned_from": str(task.id)},
        )
        broadcast(
            workspace_id,
            "task.created",
            TaskSerializer(new_task, context={"request": request}).data,
        )
        return Response(
            TaskSerializer(new_task, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class TaskChildrenView(APIView):
    """GET /tasks/:id/children/ — list direct child tasks."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        children = task.children.select_related("status", "assignee").all()
        return Response(
            TaskSerializer(children, many=True, context={"request": request}).data
        )

    def post(self, request, workspace_id, project_id, task_id):
        """Create a child task under this parent."""
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        parent = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        data = request.data.copy()
        data["parent_id"] = str(parent.id)
        serializer = TaskSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(board=board, created_by=request.user, parent=parent)
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        broadcast(workspace_id, "task.created", serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskTemplateListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        templates = board.task_templates.all()
        return Response(TaskTemplateSerializer(templates, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = TaskTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(board=board, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskTemplateDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, project_id, template_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        serializer = TaskTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, template_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskApplyTemplateView(APIView):
    """POST /tasks/:id/apply-template/ — apply a template to an existing task (fills subtasks)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        template_id = request.data.get("template_id")
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        for i, sub in enumerate(template.default_subtasks):
            SubTask.objects.get_or_create(
                task=task, title=sub.get("title", ""), defaults={"order": i}
            )
        return Response(TaskDetailSerializer(task, context={"request": request}).data)


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────


class WikiPageListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        pages = board.wiki_pages.filter(parent=None).prefetch_related("children")
        return Response(WikiPageSerializer(pages, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = WikiPageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = serializer.save(board=board, created_by=request.user)
        return Response(WikiPageSerializer(page).data, status=status.HTTP_201_CREATED)


class WikiPageDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_page(self, workspace_id, project_id, page_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(WikiPage, id=page_id, board=board), board

    def get(self, request, workspace_id, project_id, page_id):
        page, _ = self._get_page(workspace_id, project_id, page_id, request.user)
        return Response(WikiPageSerializer(page).data)

    def patch(self, request, workspace_id, project_id, page_id):
        page, board = self._get_page(workspace_id, project_id, page_id, request.user)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        # Save a revision before updating
        WikiRevision.objects.create(
            page=page, content=page.content, title=page.title, author=request.user
        )
        serializer = WikiPageSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, page_id):
        page, board = self._get_page(workspace_id, project_id, page_id, request.user)
        if not has_project_permission(request.user, board, "admin"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Admin role required.")
        page.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPageRevisionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, page_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        page = get_object_or_404(WikiPage, id=page_id, board=board)
        revisions = page.revisions.select_related("author")[:20]
        return Response(WikiRevisionSerializer(revisions, many=True).data)


class DocumentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        docs = workspace.documents.select_related("created_by")
        return Response(DocumentSerializer(docs, many=True).data)

    def post(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        serializer = DocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_doc(self, workspace_id, doc_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(Document, id=doc_id, workspace=workspace)

    def get(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        return Response(DocumentSerializer(doc).data)

    def patch(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        serializer = DocumentSerializer(doc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, doc_id):
        doc = self._get_doc(workspace_id, doc_id, request.user)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────


class FormListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        forms = board.forms.prefetch_related("fields")
        return Response(FormSerializer(forms, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = FormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = serializer.save(board=board, created_by=request.user)
        return Response(FormSerializer(form).data, status=status.HTTP_201_CREATED)


class FormDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_form(self, workspace_id, project_id, form_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(Form, id=form_id, board=board), board

    def get(self, request, workspace_id, project_id, form_id):
        form, _ = self._get_form(workspace_id, project_id, form_id, request.user)
        return Response(FormSerializer(form).data)

    def patch(self, request, workspace_id, project_id, form_id):
        form, board = self._get_form(workspace_id, project_id, form_id, request.user)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = FormSerializer(form, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, form_id):
        form, board = self._get_form(workspace_id, project_id, form_id, request.user)
        if not has_project_permission(request.user, board, "admin"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Admin role required.")
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldsBulkUpdateView(APIView):
    """PUT /forms/:id/fields/ — replace all fields in one shot (drag-drop reorder support)."""

    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, workspace_id, project_id, form_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        form = get_object_or_404(Form, id=form_id, board=board)
        form.fields.all().delete()
        new_fields = []
        for i, f in enumerate(request.data):
            new_fields.append(
                FormField(
                    form=form,
                    label=f.get("label", ""),
                    field_type=f.get("field_type", "short_text"),
                    placeholder=f.get("placeholder", ""),
                    is_required=f.get("is_required", False),
                    options=f.get("options", []),
                    order=i,
                )
            )
        FormField.objects.bulk_create(new_fields)
        return Response(FormSerializer(form).data)


class PublicFormView(APIView):
    """GET /forms/:token/ — unauthenticated, returns public form definition."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, form_token):
        form = get_object_or_404(Form, token=form_token, is_active=True)
        return Response(PublicFormSerializer(form).data)


class PublicFormSubmitView(APIView):
    """POST /forms/:token/submit/ — unauthenticated public submission."""

    permission_classes = [permissions.AllowAny]

    def post(self, request, form_token):
        form = get_object_or_404(Form, token=form_token, is_active=True)
        answers = request.data.get("answers", {})
        submitter_email = request.data.get("email", "")

        submission = FormSubmission.objects.create(
            form=form,
            answers=answers,
            submitter_email=submitter_email,
        )

        # Auto-create task if configured
        cfg = form.config or {}
        if cfg.get("create_task", True):
            title_field_id = cfg.get("title_field_id")
            title = (
                answers.get(title_field_id, "")
                if title_field_id
                else f"Submission from {submitter_email or 'form'}"
            )
            if not title:
                title = f"Form submission — {form.name}"
            status_id = cfg.get("default_status_id")
            task_status = None
            if status_id:
                try:
                    task_status = TaskStatus.objects.get(id=status_id, board=form.board)
                except TaskStatus.DoesNotExist:
                    task_status = form.board.statuses.first()
            else:
                task_status = form.board.statuses.first()

            task = Task.objects.create(
                board=form.board,
                title=title[:500],
                description=f"**Via form:** {form.name}\n\n**Submitter:** {submitter_email}",
                status=task_status,
                created_by=None,
            )
            submission.task = task
            submission.save(update_fields=["task"])

        return Response(
            {"success": True, "submission_id": str(submission.id)},
            status=status.HTTP_201_CREATED,
        )


class FormSubmissionListView(APIView):
    """GET /forms/:id/submissions/ — authenticated, returns all submissions."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, form_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        form = get_object_or_404(Form, id=form_id, board=board)
        subs = form.submissions.select_related("task").order_by("-submitted_at")
        return Response(FormSubmissionSerializer(subs, many=True).data)

    def patch(self, request, workspace_id, project_id, form_id):
        """Update a submission status."""
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        form = get_object_or_404(Form, id=form_id, board=board)
        sub_id = request.data.get("id")
        sub = get_object_or_404(FormSubmission, id=sub_id, form=form)
        new_status = request.data.get("status")
        if new_status in [s[0] for s in FormSubmission.Status.choices]:
            sub.status = new_status
            sub.save(update_fields=["status"])
        return Response(FormSubmissionSerializer(sub).data)


# ── v2.7.0 — Automation Engine ────────────────────────────────────────────────


class AutomationRuleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        rules = board.automation_rules.all()
        return Response(AutomationRuleSerializer(rules, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = AutomationRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(board=board, created_by=request.user)
        return Response(
            AutomationRuleSerializer(rule).data, status=status.HTTP_201_CREATED
        )


class AutomationRuleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_rule(self, workspace_id, project_id, rule_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(AutomationRule, id=rule_id, board=board), board

    def patch(self, request, workspace_id, project_id, rule_id):
        rule, board = self._get_rule(workspace_id, project_id, rule_id, request.user)
        if not has_project_permission(request.user, board, "edit"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Editor role required.")
        serializer = AutomationRuleSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id, rule_id):
        rule, board = self._get_rule(workspace_id, project_id, rule_id, request.user)
        if not has_project_permission(request.user, board, "admin"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("Admin role required.")
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AutomationLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id, rule_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        rule = get_object_or_404(AutomationRule, id=rule_id, board=board)
        logs = rule.logs.order_by("-created_at")[:50]
        return Response(AutomationLogSerializer(logs, many=True).data)


# ── v3.4.0 — My Work ─────────────────────────────────────────────────────────
class MyWorkView(APIView):
    """GET /my-work/ — all tasks assigned to the current user, across all workspaces, sorted by urgency."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_ids = WorkspaceMember.objects.filter(user=request.user).values_list(
            "workspace_id", flat=True
        )
        tasks = (
            Task.objects.filter(
                board__workspace_id__in=workspace_ids, assignee=request.user
            )
            .exclude(status__is_done=True)
            .select_related("status", "assignee", "sprint", "board__workspace")
            .prefetch_related("labels", "blocked_by_deps")
        )

        today = timezone.now().date()
        week_end = today + datetime.timedelta(days=7)

        def urgency(t):
            score = 0
            if t.due_date:
                d = t.due_date
                if d < today:
                    score += 100
                elif d == today:
                    score += 30
                elif d <= week_end:
                    score += 10
            if t.priority == "urgent":
                score += 50
            elif t.priority == "high":
                score += 20
            return score

        sorted_tasks = sorted(tasks, key=lambda t: -urgency(t))
        return Response(
            MyWorkTaskSerializer(
                sorted_tasks, many=True, context={"request": request}
            ).data
        )

# ── v3.5.0 — Real-Time Collaboration v2 ──────────────────────────────────────
class UserPresenceView(APIView):
    """
    POST   /workspaces/:slug/presence/  — join/heartbeat a resource
    DELETE /workspaces/:slug/presence/  — leave
    GET    /workspaces/:slug/presence/?resource_type=X&resource_id=Y — active viewers
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_workspace_for_user(slug, user)

    def get(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.query_params.get("resource_type")
        resource_id = request.query_params.get("resource_id")
        cutoff = timezone.now() - datetime.timedelta(seconds=90)
        qs = workspace.presences.filter(last_seen__gte=cutoff).select_related("user")
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return Response(UserPresenceSerializer(qs, many=True).data)

    def post(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.data.get(
            "resource_type", UserPresence.ResourceType.BOARD
        )
        resource_id = str(request.data.get("resource_id", ""))
        if not resource_id:
            return Response(
                {"detail": "resource_id required."}, status=status.HTTP_400_BAD_REQUEST
            )

        # last_seen is auto_now, so update_or_create already stamps it on save.
        # Avoid a separate update + refresh_from_db, which races with a concurrent
        # DELETE (leave) and raises UserPresence.DoesNotExist.
        presence, _ = UserPresence.objects.update_or_create(
            user=request.user,
            workspace=workspace,
            resource_type=resource_type,
            resource_id=resource_id,
            defaults={},
        )

        data = UserPresenceSerializer(presence).data
        broadcast(
            workspace_id,
            "presence.updated",
            {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "user": data["user"],
                "last_seen": data["last_seen"],
                "action": "join",
            },
        )
        return Response(data)

    def delete(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.data.get("resource_type")
        resource_id = str(request.data.get("resource_id", ""))

        qs = UserPresence.objects.filter(user=request.user, workspace=workspace)
        if resource_type and resource_id:
            qs = qs.filter(resource_type=resource_type, resource_id=resource_id)
        qs.delete()

        if resource_type and resource_id:
            from accounts.serializers import UserSerializer as AccUserSerializer

            broadcast(
                workspace_id,
                "presence.updated",
                {
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "user": AccUserSerializer(request.user).data,
                    "action": "leave",
                },
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentReactionToggleView(APIView):
    """
    POST /tasks/:id/comments/:comment_id/reactions/
    Body: { "emoji": "👍" }
    Toggles the reaction — creates if absent, deletes if present.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_comment(self, workspace_id, project_id, task_id, comment_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        return get_object_or_404(TaskComment, id=comment_id, task=task)

    def post(self, request, workspace_id, project_id, task_id, comment_id):
        comment = self._get_comment(
            workspace_id, project_id, task_id, comment_id, request.user
        )
        emoji = request.data.get("emoji", "").strip()
        if not emoji:
            return Response(
                {"detail": "emoji required."}, status=status.HTTP_400_BAD_REQUEST
            )

        existing = CommentReaction.objects.filter(
            comment=comment, user=request.user, emoji=emoji
        ).first()
        if existing:
            existing.delete()
            action = "removed"
        else:
            CommentReaction.objects.create(
                comment=comment, user=request.user, emoji=emoji
            )
            action = "added"

        grouped = {}
        for r in comment.reactions.select_related("user").all():
            grouped.setdefault(r.emoji, []).append(
                {
                    "id": str(r.id),
                    "user_id": str(r.user_id),
                    "name": r.user.full_name or r.user.email,
                }
            )

        broadcast(
            workspace_id,
            "reaction.updated",
            {
                "comment_id": str(comment.id),
                "task_id": str(task_id),
                "project_id": str(project_id),
                "reactions": grouped,
                "action": action,
                "emoji": emoji,
            },
        )
        return Response({"reactions": grouped, "action": action})


# ── v3.6.0 — Approval Workflows ──────────────────────────────────────────────


class ApprovalListCreateView(APIView):
    """
    GET  /tasks/:id/approvals/  — list all approvals for a task
    POST /tasks/:id/approvals/  — request a new approval
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_task(self, workspace_id, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        return get_object_or_404(Task, id=_parse_pk(task_id), board=board)

    def get(self, request, workspace_id, project_id, task_id):
        task = self._get_task(workspace_id, project_id, task_id, request.user)
        approvals = task.approvals.prefetch_related("reviewers__user").select_related(
            "requested_by"
        )
        return Response(ApprovalSerializer(approvals, many=True).data)

    def post(self, request, workspace_id, project_id, task_id):
        task = self._get_task(workspace_id, project_id, task_id, request.user)
        serializer = ApprovalSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        approval = serializer.save(task=task, requested_by=request.user)

        # Notify every reviewer
        workspace = task.board.workspace
        for reviewer in approval.reviewers.select_related("user"):
            notify(
                recipient=reviewer.user,
                actor=request.user,
                verb=Notification.Verb.APPROVAL_REQUESTED,
                workspace=workspace,
                task=task,
            )

        broadcast(
            workspace_id,
            "approval.created",
            {
                "task_id": str(task_id),
                "project_id": str(project_id),
                "approval": ApprovalSerializer(approval).data,
            },
        )
        return Response(
            ApprovalSerializer(approval).data, status=status.HTTP_201_CREATED
        )


class ApprovalReviewView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/review/
    Body: { "status": "approved"|"rejected"|"changes_requested", "comment": "..." }
    Only the designated reviewer can submit their verdict.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_approval(self, workspace_id, project_id, task_id, approval_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        return get_object_or_404(
            Approval.objects.prefetch_related("reviewers__user").select_related(
                "requested_by"
            ),
            id=approval_id,
            task=task,
        )

    def post(self, request, workspace_id, project_id, task_id, approval_id):
        approval = self._get_approval(
            workspace_id, project_id, task_id, approval_id, request.user
        )

        reviewer = approval.reviewers.filter(user=request.user).first()
        if not reviewer:
            return Response(
                {"detail": "You are not a reviewer on this approval."},
                status=status.HTTP_403_FORBIDDEN,
            )

        new_status = request.data.get("status")
        valid_statuses = [
            ApprovalReviewer.Status.APPROVED,
            ApprovalReviewer.Status.REJECTED,
            ApprovalReviewer.Status.CHANGES_REQUESTED,
        ]
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"status must be one of: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reviewer.status = new_status
        reviewer.comment = request.data.get("comment", "")
        reviewer.reviewed_at = timezone.now()
        reviewer.save(update_fields=["status", "comment", "reviewed_at"])

        # Recompute overall approval status
        old_overall = approval.status
        approval.recompute_status()

        data = ApprovalSerializer(approval).data
        broadcast(
            workspace_id,
            "approval.updated",
            {
                "task_id": str(task_id),
                "project_id": str(project_id),
                "approval": data,
            },
        )

        # Fire automation triggers when overall status changes
        if approval.status != old_overall:
            from .automation import fire_automation

            trigger = None
            if approval.status == Approval.Status.APPROVED:
                trigger = "approval.approved"
            elif approval.status == Approval.Status.REJECTED:
                trigger = "approval.rejected"
            if trigger:
                fire_automation(
                    trigger,
                    approval.task,
                    actor=request.user,
                    context={"approval_id": str(approval_id)},
                )

        return Response(data)


class ApprovalResubmitView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/resubmit/
    Resets a changes_requested or rejected approval back to pending so reviewers
    can re-evaluate without the assignee creating a duplicate approval record.
    Only the original requester may resubmit.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id, task_id, approval_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        task = get_object_or_404(Task, id=_parse_pk(task_id), board=board)
        approval = get_object_or_404(Approval, id=approval_id, task=task)

        if approval.requested_by != request.user:
            return Response(
                {"detail": "Only the original requester can resubmit."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if approval.status == Approval.Status.APPROVED:
            return Response(
                {"detail": "This approval is already approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Reset the approval and all individual reviewer verdicts back to pending
        approval.status = Approval.Status.PENDING
        approval.save(update_fields=["status", "updated_at"])
        approval.reviewers.all().update(
            status=ApprovalReviewer.Status.PENDING, comment=""
        )

        # Notify each reviewer again
        for reviewer in approval.reviewers.select_related("user"):
            notify(
                recipient=reviewer.user,
                actor=request.user,
                verb=Notification.Verb.APPROVAL_REQUESTED,
                workspace=workspace,
                task=task,
            )

        broadcast(
            workspace_id,
            "approval.updated",
            {
                "task_id": str(task_id),
                "project_id": str(project_id),
                "approval": ApprovalSerializer(approval).data,
            },
        )

        return Response(ApprovalSerializer(approval).data)


# ── v3.8.0 — OKR & Goal Tracking ─────────────────────────────────────────────


class ObjectiveListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_workspace_for_user(slug, user)

    def get(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        time_period = request.query_params.get("time_period")
        qs = Objective.objects.filter(workspace=workspace).prefetch_related(
            "key_results__tasks", "owner"
        )
        if time_period and time_period != "all":
            qs = qs.filter(time_period=time_period)
        return Response(
            ObjectiveSerializer(qs, many=True, context={"request": request}).data
        )

    def post(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        serializer = ObjectiveSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(workspace=workspace, owner=request.user)
        return Response(
            ObjectiveSerializer(obj, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class ObjectiveDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_obj(self, workspace_id, obj_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(
            Objective.objects.prefetch_related("key_results__tasks").select_related(
                "owner"
            ),
            id=obj_id,
            workspace=workspace,
        )

    def get(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        return Response(ObjectiveSerializer(obj, context={"request": request}).data)

    def patch(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        serializer = ObjectiveSerializer(
            obj, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, obj_id):
        obj = self._get_obj(workspace_id, obj_id, request.user)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class KeyResultListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/:obj_id/key-results/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_objective(self, workspace_id, obj_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(Objective, id=obj_id, workspace=workspace)

    def get(self, request, workspace_id, obj_id):
        obj = self._get_objective(workspace_id, obj_id, request.user)
        return Response(
            KeyResultSerializer(
                obj.key_results.prefetch_related("tasks"), many=True
            ).data
        )

    def post(self, request, workspace_id, obj_id):
        obj = self._get_objective(workspace_id, obj_id, request.user)
        serializer = KeyResultSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        kr = serializer.save(objective=obj)
        return Response(KeyResultSerializer(kr).data, status=status.HTTP_201_CREATED)


class KeyResultDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/key-results/:kr_id/"""

    permission_classes = [permissions.IsAuthenticated]

    def _get_kr(self, workspace_id, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(
            KeyResult.objects.prefetch_related("tasks"), id=kr_id, objective=obj
        )

    def get(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        return Response(KeyResultSerializer(kr).data)

    def patch(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        new_value = request.data.get("current_value")
        if new_value is not None and str(new_value) != str(kr.current_value):
            kr.record_checkin(new_value)
            kr.refresh_from_db()
            other_data = {k: v for k, v in request.data.items() if k != "current_value"}
            if other_data:
                serializer = KeyResultSerializer(kr, data=other_data, partial=True)
                serializer.is_valid(raise_exception=True)
                kr = serializer.save()
        else:
            serializer = KeyResultSerializer(kr, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            kr = serializer.save()
        return Response(KeyResultSerializer(kr).data)

    def delete(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        kr.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class KeyResultLinkedTasksView(APIView):
    """Manage tasks linked to a Key Result.
    GET    — list linked tasks
    PUT    — replace full task set { task_ids: [...] }
    POST   — link one task { task_id: "..." }
    DELETE — unlink one task { task_id: "..." }
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_kr(self, workspace_id, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(
            KeyResult.objects.prefetch_related("tasks__status"), id=kr_id, objective=obj
        )

    def get(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        return Response(KeyResultLinkedTaskSerializer(kr.tasks.all(), many=True).data)

    def put(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        kr.tasks.set(request.data.get("task_ids", []))
        return Response(KeyResultSerializer(kr).data)

    def post(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.add(task_id)
        return Response(KeyResultSerializer(kr).data)

    def delete(self, request, workspace_id, obj_id, kr_id):
        kr = self._get_kr(workspace_id, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.remove(task_id)
        return Response(KeyResultSerializer(kr).data)
