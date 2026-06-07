from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import models as django_models
from django.http import HttpResponse
from django.db.models import Count, Sum, Avg, Min, Max, F, Q
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from django.utils import timezone
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from workspaces.models import Workspace, WorkspaceMember, Notification
import datetime
import csv
import re
from .models import (
    Project, TaskStatus, Task, SubTask, TaskComment, TaskActivity, Label,
    ProjectField, TaskFieldValue, SavedView, Sprint,
    TaskAttachment, TaskDependency, TaskTemplate,
    WikiPage, WikiRevision, Document,
    Form, FormField, FormSubmission,
    AutomationRule, AutomationLog,
    TimeEntry,
    ProjectMember, GuestToken,
    Board,
    Dashboard,
    UserPresence, CommentReaction,
    Approval, ApprovalReviewer,
    Objective, KeyResult,
    Report, ReportShare, ScheduledReport,
    ImportJob,
)
from .serializers import (
    ProjectSerializer, TaskStatusSerializer,
    TaskSerializer, TaskDetailSerializer,
    SubTaskSerializer, TaskCommentSerializer, TaskActivitySerializer,
    LabelSerializer, TaskSearchSerializer, ProjectSearchSerializer,
    ProjectFieldSerializer, TaskFieldValueSerializer, SavedViewSerializer, SprintSerializer,
    TaskAttachmentSerializer, MinimalTaskSerializer, TaskDependencySerializer,
    TaskTemplateSerializer,
    WikiPageSerializer, WikiRevisionSerializer, DocumentSerializer,
    FormSerializer, FormFieldSerializer, FormSubmissionSerializer, PublicFormSerializer,
    AutomationRuleSerializer, AutomationLogSerializer,
    TimeEntrySerializer,
    ProjectMemberSerializer, GuestTokenSerializer,
    BoardSerializer,
    DashboardSerializer,
    MyWorkTaskSerializer,
    UserPresenceSerializer, CommentReactionSerializer,
    ApprovalSerializer, ApprovalReviewerSerializer,
    ObjectiveSerializer, KeyResultSerializer, KeyResultLinkedTaskSerializer,
    ReportSerializer, ReportShareSerializer, ScheduledReportSerializer,
)
from .permissions import has_project_permission, get_effective_role, log_audit

# ── Board templates (v2.2.0) ─────────────────────────────────────────────────
BOARD_TEMPLATES = [
    {
        "key": "software_dev",
        "name": "Software Development",
        "description": "Agile workflow for engineering teams",
        "board_type": "kanban",
        "config": {},
    },
    {
        "key": "marketing",
        "name": "Marketing Campaign",
        "description": "Track campaigns from idea to launch",
        "board_type": "kanban",
        "config": {},
    },
    {
        "key": "product_launch",
        "name": "Product Launch",
        "description": "Coordinate cross-functional launch activities",
        "board_type": "kanban",
        "config": {},
    },
    {
        "key": "bug_tracker",
        "name": "Bug Tracker",
        "description": "Capture, prioritise and resolve bugs",
        "board_type": "list",
        "config": {},
    },
    {
        "key": "customer_requests",
        "name": "Customer Requests",
        "description": "Manage incoming feature requests and feedback",
        "board_type": "list",
        "config": {},
    },
]


def get_workspace_for_user(slug, user):
    return get_object_or_404(Workspace, slug=slug, members__user=user)


def broadcast(workspace_slug, event_type, data):
    """Push a real-time event to all WebSocket clients in this workspace."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"workspace_{workspace_slug}",
        {"type": "workspace.event", "data": {"type": event_type, "payload": data}},
    )
    # v4.5.0 — also fan out to registered webhooks
    _fire_webhooks(workspace_slug, event_type, data)


def _fire_webhooks(workspace_slug, event_type, data):
    """Queue webhook deliveries for all active webhooks subscribed to this event."""
    try:
        from workspaces.models import Webhook
        from workspaces.tasks import deliver_webhook

        # Map internal event names to public webhook event names
        _EVENT_MAP = {
            "task.created":   "task.created",
            "task.updated":   "task.updated",
            "task.moved":     "task.updated",
            "task.deleted":   "task.deleted",
            "task.commented": "task.commented",
            "tasks.bulk_updated": "task.updated",
            "tasks.bulk_deleted": "task.deleted",
            "sprint.started":    "sprint.started",
            "sprint.completed":  "sprint.completed",
        }
        webhook_event = _EVENT_MAP.get(event_type)
        if not webhook_event:
            return

        hooks = Webhook.objects.filter(
            workspace__slug=workspace_slug,
            is_active=True,
        )
        payload = {"event": webhook_event, "workspace": workspace_slug, "data": data}
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
    Notification.Verb.TASK_ASSIGNED:      "assigned",
    Notification.Verb.TASK_COMMENTED:     "commented",
    Notification.Verb.TASK_MENTIONED:     "mentioned",
    Notification.Verb.APPROVAL_REQUESTED: "approved",
}


def notify(recipient, actor, verb, workspace, task):
    """Create a Notification + InboxItem and push to the recipient's WS group. No-op if actor == recipient."""
    if recipient == actor:
        return
    meta = {
        "task_id": str(task.id),
        "task_title": task.title,
        "project_id": str(task.project_id),
        "workspace_slug": workspace.slug,
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
        project_id=str(task.project_id),
        project_name=task.project.name if hasattr(task, "project") else "",
        meta=meta,
    )

    broadcast_to_user(str(recipient.id), "notification.created", {
        "id": str(notif.id),
        "actor": {"id": str(actor.id), "full_name": actor.full_name, "email": actor.email},
        "verb": notif.verb,
        "meta": notif.meta,
        "read": False,
        "created_at": notif.created_at.isoformat(),
    })

    # v4.3.0 — fan out to Slack / Teams / Google Chat
    try:
        from integrations.services import fanout_notification
        fanout_notification(workspace, verb, task, actor)
    except Exception:
        pass  # never break the main request path


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()

        if is_admin:
            projects = workspace.projects.all()
        else:
            # Exclude private projects the user is not explicitly a member of
            public_qs  = workspace.projects.filter(is_private=False)
            private_qs = workspace.projects.filter(is_private=True, project_members__user=request.user)
            projects = (public_qs | private_qs).distinct()

        return Response(ProjectSerializer(projects, many=True, context={"request": request}).data)

    def post(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        serializer = ProjectSerializer(data=request.data, context={"request": request, "workspace": workspace})
        serializer.is_valid(raise_exception=True)
        project = serializer.save()
        return Response(ProjectSerializer(project, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        return Response(ProjectSerializer(project, context={"request": request}).data)

    def patch(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = ProjectSerializer(project, data=request.data, partial=True, context={"request": request, "workspace": project.workspace})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=project.workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        if not is_admin:
            return Response({"detail": "Only workspace admins can delete projects."}, status=status.HTTP_403_FORBIDDEN)
        project.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Statuses (Kanban columns) ────────────────────────────────────────────

class TaskStatusListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        return Response(TaskStatusSerializer(project.statuses.all(), many=True).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = TaskStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Auto-assign next order
        max_order = project.statuses.order_by("-order").values_list("order", flat=True).first() or 0
        serializer.save(project=project, order=max_order + 1)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskStatusDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_status(self, workspace_slug, project_id, status_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(TaskStatus, id=status_id, project=project)

    def patch(self, request, workspace_slug, project_id, status_id):
        task_status = self._get_status(workspace_slug, project_id, status_id, request.user)
        serializer  = TaskStatusSerializer(task_status, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        broadcast(workspace_slug, "status.updated", serializer.data)
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, status_id):
        task_status = self._get_status(workspace_slug, project_id, status_id, request.user)
        if task_status.tasks.exists():
            return Response(
                {"error": "Cannot delete a column that still has tasks. Move tasks first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        task_status.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Tasks ─────────────────────────────────────────────────────────────────────

class TaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        tasks = project.tasks.select_related("status", "assignee", "created_by", "sprint").prefetch_related("subtasks", "comments", "labels", "blocked_by_deps")
        sprint_param = request.query_params.get("sprint")
        if sprint_param == "none":
            tasks = tasks.filter(sprint__isnull=True)
        elif sprint_param:
            tasks = tasks.filter(sprint_id=sprint_param)
        # v2.9.0 — optional date-range filter (used by calendar view)
        start = request.query_params.get("start")
        end   = request.query_params.get("end")
        if start:
            tasks = tasks.filter(due_date__gte=start)
        if end:
            tasks = tasks.filter(due_date__lte=end)
        return Response(TaskSerializer(tasks, many=True, context={"request": request}).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = TaskSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(project=project)
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        if task.assignee and task.assignee != request.user:
            notify(task.assignee, request.user, Notification.Verb.TASK_ASSIGNED, project.workspace, task)
        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_slug, "task.created", data)
        return Response(data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(
            Task.objects.select_related("status", "assignee", "created_by", "sprint").prefetch_related("subtasks", "comments__author", "activities__actor", "labels", "field_values__field"),
            id=task_id, project=project,
        )

    def get(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)
        return Response(TaskDetailSerializer(task, context={"request": request}).data)

    def patch(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)

        # v3.5.0 — optimistic locking: reject stale writes
        incoming_version = request.data.get("version")
        if incoming_version is not None and int(incoming_version) != task.version:
            return Response({
                "conflict": True,
                "current_version": task.version,
                "updated_at": task.updated_at.isoformat(),
            }, status=status.HTTP_409_CONFLICT)

        old_status = task.status
        old_priority = task.priority
        old_assignee = task.assignee

        serializer = TaskSerializer(task, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Increment version on every successful save
        Task.objects.filter(pk=task.pk).update(version=task.version + 1)
        task.refresh_from_db()

        # Log what actually changed
        if "status_id" in request.data and task.status != old_status:
            log_activity(task, request.user, TaskActivity.Verb.STATUS, {
                "from": old_status.name if old_status else None,
                "to": task.status.name if task.status else None,
            })
        elif "priority" in request.data and task.priority != old_priority:
            log_activity(task, request.user, TaskActivity.Verb.PRIORITY, {
                "from": old_priority, "to": task.priority,
            })
        elif "assignee_id" in request.data and task.assignee != old_assignee:
            log_activity(task, request.user, TaskActivity.Verb.ASSIGNED, {
                "to": task.assignee.full_name if task.assignee else None,
            })
            if task.assignee and task.assignee != request.user:
                notify(task.assignee, request.user, Notification.Verb.TASK_ASSIGNED, task.project.workspace, task)
        else:
            log_activity(task, request.user, TaskActivity.Verb.UPDATED)

        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_slug, "task.updated", data)
        return Response(data)

    def delete(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)
        task_id_str = str(task.id)
        task.delete()
        broadcast(workspace_slug, "task.deleted", {"id": task_id_str, "project_id": str(project_id)})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Move (Kanban drag & drop) ────────────────────────────────────────────

class TaskMoveView(APIView):
    """Update a task's status column and order in one atomic call."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)

        status_id = request.data.get("status_id")
        order = request.data.get("order")
        old_status = task.status

        if status_id is not None:
            task_status = get_object_or_404(TaskStatus, id=status_id, project=project)
            # v3.6.0 — approval gate: block only if there is an approval still awaiting a verdict.
            # changes_requested / rejected are closed states — the reviewer already responded.
            if task_status.is_done:
                if task.approvals.filter(status=Approval.Status.PENDING).exists():
                    return Response(
                        {"approval_required": True,
                         "detail": "This task has pending approvals. Resolve them before marking it done."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            task.status = task_status
        if order is not None:
            task.order = order

        task.save(update_fields=["status", "order", "updated_at"])

        if task.status != old_status:
            log_activity(task, request.user, TaskActivity.Verb.STATUS, {
                "from": old_status.name if old_status else None,
                "to": task.status.name if task.status else None,
            })

        data = TaskSerializer(task, context={"request": request}).data
        broadcast(workspace_slug, "task.moved", data)
        return Response(data)


# ── Subtasks ──────────────────────────────────────────────────────────────────

class SubTaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, project=project)

    def get(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)
        return Response(SubTaskSerializer(task.subtasks.all(), many=True).data)

    def post(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)
        serializer = SubTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subtask = serializer.save(task=task)
        log_activity(task, request.user, TaskActivity.Verb.SUBTASK, {"title": subtask.title})
        return Response(SubTaskSerializer(subtask).data, status=status.HTTP_201_CREATED)


class SubTaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_subtask(self, workspace_slug, project_id, task_id, subtask_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)
        return get_object_or_404(SubTask, id=subtask_id, task=task)

    def patch(self, request, workspace_slug, project_id, task_id, subtask_id):
        subtask = self.get_subtask(workspace_slug, project_id, task_id, subtask_id, request.user)
        serializer = SubTaskSerializer(subtask, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, task_id, subtask_id):
        subtask = self.get_subtask(workspace_slug, project_id, task_id, subtask_id, request.user)
        subtask.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Comments ──────────────────────────────────────────────────────────────────

class TaskCommentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, project=project)

    def get(self, request, workspace_slug, project_id, task_id):
        task = self.get_task(workspace_slug, project_id, task_id, request.user)
        return Response(TaskCommentSerializer(task.comments.select_related("author").all(), many=True, context={"request": request}).data)

    def post(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)
        serializer = TaskCommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(task=task)
        log_activity(task, request.user, TaskActivity.Verb.COMMENTED)
        # Notify assignee and task creator
        recipients = {u for u in [task.assignee, task.created_by] if u and u != request.user}
        for recipient in recipients:
            notify(recipient, request.user, Notification.Verb.TASK_COMMENTED, workspace, task)
        # Parse @mentions and notify mentioned users
        mentions = re.findall(r'@(\w+)', comment.body)
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
                            notify(user, request.user, Notification.Verb.TASK_MENTIONED, workspace, task)
                            recipients.add(user)
        data = TaskCommentSerializer(comment, context={"request": request}).data
        broadcast(workspace_slug, "comment.created", {
            "task_id": str(task.id),
            "project_id": str(task.project_id),
            "comment": data,
        })
        return Response(data, status=status.HTTP_201_CREATED)


class TaskCommentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_comment(self, workspace_slug, project_id, task_id, comment_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)
        return get_object_or_404(TaskComment, id=comment_id, task=task)

    def patch(self, request, workspace_slug, project_id, task_id, comment_id):
        comment = self.get_comment(workspace_slug, project_id, task_id, comment_id, request.user)
        if comment.author != request.user:
            return Response({"detail": "You can only edit your own comments."}, status=status.HTTP_403_FORBIDDEN)
        serializer = TaskCommentSerializer(comment, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, task_id, comment_id):
        comment = self.get_comment(workspace_slug, project_id, task_id, comment_id, request.user)
        if comment.author != request.user:
            return Response({"detail": "You can only delete your own comments."}, status=status.HTTP_403_FORBIDDEN)
        comment_id_str = str(comment.id)
        comment.delete()
        broadcast(workspace_slug, "comment.deleted", {
            "task_id": str(task_id),
            "project_id": str(project_id),
            "comment_id": comment_id_str,
        })
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Labels ────────────────────────────────────────────────────────────────────

class LabelListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        return Response(LabelSerializer(project.labels.all(), many=True).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = LabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        label = serializer.save(project=project)
        return Response(LabelSerializer(label).data, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_label(self, workspace_slug, project_id, label_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Label, id=label_id, project=project)

    def patch(self, request, workspace_slug, project_id, label_id):
        label = self.get_label(workspace_slug, project_id, label_id, request.user)
        serializer = LabelSerializer(label, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, label_id):
        label = self.get_label(workspace_slug, project_id, label_id, request.user)
        label.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Activity ──────────────────────────────────────────────────────────────────

class TaskActivityListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)
        activities = task.activities.select_related("actor").all()
        return Response(TaskActivitySerializer(activities, many=True).data)


# ── Global Search ─────────────────────────────────────────────────────────────

class GlobalSearchView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # ── Query params ──────────────────────────────────────────────────────
        q         = request.query_params.get("q",         "").strip()
        task_type = request.query_params.get("task_type", "").strip()
        assignee  = request.query_params.get("assignee",  "").strip()
        priority  = request.query_params.get("priority",  "").strip()
        overdue   = request.query_params.get("overdue",   "").lower() == "true"
        today_only = request.query_params.get("today",   "").lower() == "true"

        has_any = len(q) >= 2 or task_type or assignee or priority or overdue or today_only
        if not has_any:
            return Response({"tasks": [], "projects": []})

        workspace_ids = WorkspaceMember.objects.filter(
            user=request.user
        ).values_list("workspace_id", flat=True)

        tasks = Task.objects.filter(
            project__workspace_id__in=workspace_ids,
        ).select_related("project__workspace", "status", "assignee")

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
            Project.objects.filter(workspace_id__in=workspace_ids, name__icontains=q)
            .select_related("workspace")[:5]
        ) if len(q) >= 2 else []

        return Response({
            "tasks":    TaskSearchSerializer(tasks, many=True).data,
            "projects": ProjectSearchSerializer(projects, many=True).data,
        })


# v3.2.0 — Advanced filter endpoint ──────────────────────────────────────────
class AdvancedSearchView(APIView):
    """POST /search/advanced/ — arbitrary AND/OR filter tree across a workspace."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        workspace_slug = request.data.get("workspace_slug")
        tree           = request.data.get("filters", {})  # {logic, conditions, groups}
        if not workspace_slug:
            return Response({"error": "workspace_slug required"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = get_object_or_404(
            Workspace, slug=workspace_slug,
            members__user=request.user,
        )
        qs = Task.objects.filter(project__workspace=workspace).select_related("status", "assignee", "sprint").prefetch_related("labels")
        qs = self._apply_tree(qs, tree)
        return Response(TaskSerializer(qs[:100], many=True, context={"request": request}).data)

    def _apply_tree(self, qs, tree):
        if not tree:
            return qs
        logic      = tree.get("logic", "AND").upper()
        conditions = tree.get("conditions", [])
        groups     = tree.get("groups", [])

        q_expr = django_models.Q()
        for cond in conditions:
            q_expr = (q_expr & self._cond_q(cond)) if logic == "AND" else (q_expr | self._cond_q(cond))
        for grp in groups:
            grp_q = self._group_q(grp)
            q_expr = (q_expr & grp_q) if logic == "AND" else (q_expr | grp_q)

        return qs.filter(q_expr)

    def _group_q(self, group):
        logic      = group.get("logic", "AND").upper()
        conditions = group.get("conditions", [])
        q = django_models.Q()
        for cond in conditions:
            cq = self._cond_q(cond)
            q  = (q & cq) if logic == "AND" else (q | cq)
        return q

    def _cond_q(self, cond):
        field    = cond.get("field", "")
        operator = cond.get("operator", "equals")
        value    = cond.get("value")
        today    = timezone.now().date()

        try:
            if field == "text":
                return django_models.Q(title__icontains=value) | django_models.Q(description__icontains=value)
            if field == "priority":
                return django_models.Q(priority=value) if operator == "equals" else ~django_models.Q(priority=value)
            if field == "status":
                return django_models.Q(status_id=value) if operator == "equals" else ~django_models.Q(status_id=value)
            if field == "assignee":
                if operator == "is_set":   return ~django_models.Q(assignee__isnull=True)
                if operator == "is_not_set": return django_models.Q(assignee__isnull=True)
                return django_models.Q(assignee_id=value)
            if field == "task_type":
                return django_models.Q(task_type=value)
            if field == "label":
                return django_models.Q(labels__id=value)
            if field == "sprint":
                return django_models.Q(sprint_id=value)
            if field == "due_date":
                if operator == "overdue":      return django_models.Q(due_date__lt=today)
                if operator == "today":        return django_models.Q(due_date=today)
                if operator == "is_set":       return ~django_models.Q(due_date__isnull=True)
                if operator == "is_not_set":   return django_models.Q(due_date__isnull=True)
                if operator == "before":       return django_models.Q(due_date__lt=value)
                if operator == "after":        return django_models.Q(due_date__gt=value)
            if field == "has_attachment":
                return ~django_models.Q(attachments__isnull=True)
            if field == "estimate_points":
                if operator == "gte": return django_models.Q(estimate_points__gte=value)
                if operator == "lte": return django_models.Q(estimate_points__lte=value)
        except Exception:
            pass
        return django_models.Q()  # unknown condition — pass through


# ── Custom Fields (v0.8.0) ────────────────────────────────────────────────────

class ProjectFieldListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        return Response(ProjectFieldSerializer(project.fields.all(), many=True).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = ProjectFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(project=project, order=project.fields.count())
        return Response(ProjectFieldSerializer(field).data, status=status.HTTP_201_CREATED)


class ProjectFieldDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_field(self, workspace_slug, project_id, field_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(ProjectField, id=field_id, project=project)

    def patch(self, request, workspace_slug, project_id, field_id):
        field = self.get_field(workspace_slug, project_id, field_id, request.user)
        serializer = ProjectFieldSerializer(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, field_id):
        field = self.get_field(workspace_slug, project_id, field_id, request.user)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskFieldValueView(APIView):
    """Upsert a single custom field value for a task."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, project=project)
        serializer = TaskFieldValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field_value = serializer.save(task=task)
        return Response(TaskFieldValueSerializer(field_value).data)


# ── Saved Views (v0.8.0) ──────────────────────────────────────────────────────

class SavedViewListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        views = project.saved_views.filter(user=request.user)
        return Response(SavedViewSerializer(views, many=True).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = SavedViewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        view = serializer.save(project=project, user=request.user)
        return Response(SavedViewSerializer(view).data, status=status.HTTP_201_CREATED)


class SavedViewDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_view(self, workspace_slug, project_id, view_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(SavedView, id=view_id, project=project, user=user)

    def delete(self, request, workspace_slug, project_id, view_id):
        view = self.get_view(workspace_slug, project_id, view_id, request.user)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Sprints (v0.9.0) ─────────────────────────────────────────────────────────

class SprintListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_project(self, workspace_slug, project_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Project, id=project_id, workspace=workspace)

    def get(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        return Response(SprintSerializer(project.sprints.all(), many=True).data)

    def post(self, request, workspace_slug, project_id):
        project = self.get_project(workspace_slug, project_id, request.user)
        serializer = SprintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sprint = serializer.save(project=project)
        return Response(SprintSerializer(sprint).data, status=status.HTTP_201_CREATED)


class SprintDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_sprint(self, workspace_slug, project_id, sprint_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Sprint, id=sprint_id, project=project)

    def get(self, request, workspace_slug, project_id, sprint_id):
        sprint = self.get_sprint(workspace_slug, project_id, sprint_id, request.user)
        return Response(SprintSerializer(sprint).data)

    def patch(self, request, workspace_slug, project_id, sprint_id):
        sprint = self.get_sprint(workspace_slug, project_id, sprint_id, request.user)
        serializer = SprintSerializer(sprint, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, sprint_id):
        sprint = self.get_sprint(workspace_slug, project_id, sprint_id, request.user)
        sprint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SprintBurndownView(APIView):
    """Returns ideal vs actual task-completion data for a sprint's burndown chart."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, sprint_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        sprint = get_object_or_404(Sprint, id=sprint_id, project=project)

        if not sprint.start_date or not sprint.end_date:
            return Response({"error": "Sprint dates not set."}, status=status.HTTP_400_BAD_REQUEST)

        done_status = project.statuses.order_by("-order").first()
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

        completed = sprint_tasks.filter(status=done_status).count() if done_status else 0
        return Response({
            "total": total, "completed": completed, "remaining": total - completed,
            "days": days, "ideal": ideal, "actual": actual,
        })


# ── Bulk Actions (v1.1.0) ─────────────────────────────────────────────────────

class TaskBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project = get_object_or_404(Project, id=project_id, workspace=workspace)
        task_ids = request.data.get("task_ids", [])
        action   = request.data.get("action", "update")
        updates  = request.data.get("updates", {})

        if not task_ids:
            return Response({"error": "task_ids required"}, status=status.HTTP_400_BAD_REQUEST)

        tasks = Task.objects.filter(id__in=task_ids, project=project)

        if action == "delete":
            count = tasks.count()
            tasks.delete()
            broadcast(workspace_slug, "tasks.bulk_deleted", {"task_ids": task_ids, "project_id": str(project_id)})
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
            updated = TaskSerializer(tasks.select_related("status", "assignee"), many=True).data
            broadcast(workspace_slug, "tasks.bulk_updated", {"tasks": updated, "project_id": str(project_id)})
            return Response({"updated": len(updated), "tasks": updated})

        return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)


# ── File Attachments (v1.2.0) ─────────────────────────────────────────────────

class TaskAttachmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def _get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, project=project)

    def get(self, request, workspace_slug, project_id, task_id):
        task = self._get_task(workspace_slug, project_id, task_id, request.user)
        return Response(TaskAttachmentSerializer(
            task.attachments.select_related("uploaded_by").all(),
            many=True, context={"request": request},
        ).data)

    def post(self, request, workspace_slug, project_id, task_id):
        task = self._get_task(workspace_slug, project_id, task_id, request.user)
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "No file provided"}, status=status.HTTP_400_BAD_REQUEST)
        if file.size > 20 * 1024 * 1024:  # 20 MB limit
            return Response({"error": "File exceeds 20 MB limit"}, status=status.HTTP_400_BAD_REQUEST)
        attachment = TaskAttachment.objects.create(
            task=task, file=file,
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

    def delete(self, request, workspace_slug, project_id, task_id, attachment_id):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project    = get_object_or_404(Project, id=project_id, workspace=workspace)
        task       = get_object_or_404(Task, id=task_id, project=project)
        attachment = get_object_or_404(TaskAttachment, id=attachment_id, task=task)
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Dependencies (v1.4.0) ────────────────────────────────────────────────

class TaskDependencyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, project=project), project

    def get(self, request, workspace_slug, project_id, task_id):
        task, _ = self._get_task(workspace_slug, project_id, task_id, request.user)
        blocked_by = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocker).data}
            for d in task.blocked_by_deps.select_related("blocker__status").all()
        ]
        blocking = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocked).data}
            for d in task.blocking_deps.select_related("blocked__status").all()
        ]
        return Response({"blocked_by": blocked_by, "blocking": blocking})

    def post(self, request, workspace_slug, project_id, task_id):
        task, project = self._get_task(workspace_slug, project_id, task_id, request.user)
        dep_task_id = request.data.get("task_id")
        dep_type    = request.data.get("type", "blocked_by")  # "blocked_by" | "blocks"

        if not dep_task_id:
            return Response({"error": "task_id required"}, status=status.HTTP_400_BAD_REQUEST)
        dep_task = get_object_or_404(Task, id=dep_task_id, project=project)
        if dep_task.id == task.id:
            return Response({"error": "A task cannot block itself"}, status=status.HTTP_400_BAD_REQUEST)

        if dep_type == "blocked_by":
            dep, created = TaskDependency.objects.get_or_create(blocker=dep_task, blocked=task)
        else:
            dep, created = TaskDependency.objects.get_or_create(blocker=task, blocked=dep_task)

        return Response({"id": str(dep.id), "created": created}, status=status.HTTP_201_CREATED)


class TaskDependencyDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, project_id, task_id, dep_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        dep       = get_object_or_404(
            TaskDependency, id=dep_id
        )
        if dep.blocker.project != project or dep.blocked.project != project:
            return Response(status=status.HTTP_404_NOT_FOUND)
        dep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Analytics (v1.5.0) ───────────────────────────────────────────────────────

class WorkspaceAnalyticsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        all_tasks = Task.objects.filter(project__workspace=workspace)

        tasks_by_status = list(
            all_tasks.values("status__name", "status__color")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        tasks_by_priority = list(
            all_tasks.values("priority").annotate(count=Count("id")).order_by("-count")
        )

        members = workspace.members.select_related("user").all()
        workload = sorted([
            {
                "name": m.user.full_name or m.user.email.split("@")[0],
                "email": m.user.email,
                "assigned": all_tasks.filter(assignee=m.user).count(),
            }
            for m in members
        ], key=lambda x: x["assigned"], reverse=True)

        thirty_days_ago = timezone.now() - datetime.timedelta(days=30)
        trend_qs = (
            TaskActivity.objects
            .filter(
                task__project__workspace=workspace,
                verb=TaskActivity.Verb.STATUS,
                created_at__gte=thirty_days_ago,
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )

        return Response({
            "overview": {
                "projects": workspace.projects.count(),
                "tasks": all_tasks.count(),
                "members": members.count(),
                "open_tasks": all_tasks.filter(status__order__lt=3).count(),
            },
            "tasks_by_status":   tasks_by_status,
            "tasks_by_priority": tasks_by_priority,
            "workload": workload,
            "completion_trend": [
                {"date": str(item["day"]), "count": item["count"]}
                for item in trend_qs
            ],
        })


# ── Analytics Engine v2 (v4.0.0) ─────────────────────────────────────────────

def _done_status_names(workspace):
    """Return list of 'done' status names across all projects in a workspace."""
    return list(
        TaskStatus.objects.filter(project__workspace=workspace, is_done=True)
        .values_list("name", flat=True)
        .distinct()
    )


def _base_tasks(workspace, project_id=None):
    qs = Task.objects.filter(project__workspace=workspace)
    if project_id:
        qs = qs.filter(project_id=project_id)
    return qs


class VelocityView(APIView):
    """
    Sprint velocity: story points + tasks completed per sprint.
    Returns last N completed sprints (default 8) with rolling average.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project_id = request.query_params.get("project_id")
        limit      = int(request.query_params.get("limit", 8))

        sprints_qs = Sprint.objects.filter(
            project__workspace=workspace,
            status=Sprint.Status.COMPLETED,
        ).order_by("-end_date")
        if project_id:
            sprints_qs = sprints_qs.filter(project_id=project_id)

        sprints = list(reversed(sprints_qs[:limit]))
        done_ids = list(
            TaskStatus.objects.filter(project__workspace=workspace, is_done=True)
            .values_list("id", flat=True)
        )

        rows, total_sp, total_tasks = [], 0, 0
        for sprint in sprints:
            done_tasks = Task.objects.filter(sprint=sprint, status_id__in=done_ids)
            tc = done_tasks.count()
            sp = done_tasks.aggregate(s=Sum("estimate_points"))["s"] or 0
            total_sp    += sp
            total_tasks += tc
            rows.append({
                "sprint_id":        str(sprint.id),
                "sprint_name":      sprint.name,
                "start_date":       str(sprint.start_date) if sprint.start_date else None,
                "end_date":         str(sprint.end_date)   if sprint.end_date   else None,
                "tasks_completed":  tc,
                "story_points":     sp,
            })

        n = len(rows)
        return Response({
            "sprints":            rows,
            "avg_story_points":   round(total_sp    / n, 1) if n else 0,
            "avg_tasks_completed": round(total_tasks / n, 1) if n else 0,
        })


class CycleTimeView(APIView):
    """
    Cycle time: first active-status move → done per task.
    Returns scatter-plot points + percentile stats.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project_id = request.query_params.get("project_id")
        days       = int(request.query_params.get("days", 90))

        cutoff           = timezone.now() - datetime.timedelta(days=days)
        done_names       = _done_status_names(workspace)

        acts = (
            TaskActivity.objects
            .filter(
                task__project__workspace=workspace,
                verb=TaskActivity.Verb.STATUS,
                meta__to__in=done_names,
                created_at__gte=cutoff,
            )
            .select_related("task")
            .order_by("task_id", "created_at")
        )
        if project_id:
            acts = acts.filter(task__project_id=project_id)

        # First done-transition per task
        first_done = {}
        for act in acts:
            tid = str(act.task_id)
            if tid not in first_done:
                first_done[tid] = act

        points, cycle_times = [], []
        for tid, act in first_done.items():
            task     = act.task
            done_at  = act.created_at

            # First non-done, non-backlog activity before this done event
            first_active = (
                TaskActivity.objects
                .filter(task_id=tid, verb=TaskActivity.Verb.STATUS, created_at__lt=done_at)
                .exclude(meta__to__in=done_names)
                .order_by("created_at")
                .first()
            )
            start       = first_active.created_at if first_active else task.created_at
            cycle_days  = (done_at - start).total_seconds() / 86400
            if cycle_days < 0:
                continue
            cycle_times.append(cycle_days)
            points.append({
                "task_id":        tid,
                "title":          task.title,
                "cycle_days":     round(cycle_days, 1),
                "completed_date": done_at.date().isoformat(),
                "priority":       task.priority,
                "task_type":      task.task_type,
            })

        if cycle_times:
            s = sorted(cycle_times)
            n = len(s)
            stats = {
                "count":  n,
                "median": round(s[n // 2], 1),
                "p75":    round(s[min(int(n * 0.75), n - 1)], 1),
                "p95":    round(s[min(int(n * 0.95), n - 1)], 1),
                "avg":    round(sum(s) / n, 1),
            }
        else:
            stats = {"count": 0, "median": 0, "p75": 0, "p95": 0, "avg": 0}

        return Response({"data_points": points, "stats": stats})


class LeadTimeView(APIView):
    """
    Lead time: task creation → done.
    Returns histogram distribution + scatter points.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project_id = request.query_params.get("project_id")
        days       = int(request.query_params.get("days", 90))

        cutoff     = timezone.now() - datetime.timedelta(days=days)
        done_names = _done_status_names(workspace)

        acts = (
            TaskActivity.objects
            .filter(
                task__project__workspace=workspace,
                verb=TaskActivity.Verb.STATUS,
                meta__to__in=done_names,
                created_at__gte=cutoff,
            )
            .select_related("task")
            .order_by("task_id", "created_at")
        )
        if project_id:
            acts = acts.filter(task__project_id=project_id)

        seen, lead_times, points = set(), [], []
        for act in acts:
            tid = str(act.task_id)
            if tid in seen:
                continue
            seen.add(tid)
            lt = (act.created_at - act.task.created_at).total_seconds() / 86400
            if lt < 0:
                continue
            lead_times.append(lt)
            points.append({
                "task_id":        tid,
                "title":          act.task.title,
                "lead_days":      round(lt, 1),
                "completed_date": act.created_at.date().isoformat(),
            })

        buckets = [
            {"label": "< 1 day",   "min": 0,  "max": 1,    "count": 0},
            {"label": "1–3 days",  "min": 1,  "max": 3,    "count": 0},
            {"label": "3–7 days",  "min": 3,  "max": 7,    "count": 0},
            {"label": "1–2 weeks", "min": 7,  "max": 14,   "count": 0},
            {"label": "2–4 weeks", "min": 14, "max": 30,   "count": 0},
            {"label": "> 30 days", "min": 30, "max": 99999, "count": 0},
        ]
        for lt in lead_times:
            for b in buckets:
                if b["min"] <= lt < b["max"]:
                    b["count"] += 1
                    break

        if lead_times:
            s = sorted(lead_times)
            n = len(s)
            stats = {
                "count":  n,
                "median": round(s[n // 2], 1),
                "avg":    round(sum(s) / n, 1),
                "min":    round(s[0], 1),
                "max":    round(s[-1], 1),
            }
        else:
            stats = {"count": 0, "median": 0, "avg": 0, "min": 0, "max": 0}

        histogram = [{"label": b["label"], "count": b["count"]} for b in buckets]
        return Response({"histogram": histogram, "data_points": points[:100], "stats": stats})


class ThroughputView(APIView):
    """
    Throughput: tasks completed per day / week / month.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project_id = request.query_params.get("project_id")
        period     = request.query_params.get("period", "week")   # day | week | month
        days       = int(request.query_params.get("days", 90))

        cutoff     = timezone.now() - datetime.timedelta(days=days)
        done_names = _done_status_names(workspace)

        acts = TaskActivity.objects.filter(
            task__project__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            meta__to__in=done_names,
            created_at__gte=cutoff,
        )
        if project_id:
            acts = acts.filter(task__project_id=project_id)

        trunc_fn = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(period, TruncWeek)

        rows = (
            acts
            .annotate(bucket=trunc_fn("created_at"))
            .values("bucket")
            .annotate(count=Count("task", distinct=True))
            .order_by("bucket")
        )

        return Response([
            {"period": str(r["bucket"].date() if hasattr(r["bucket"], "date") else r["bucket"]),
             "count":  r["count"]}
            for r in rows
        ])


class CFDView(APIView):
    """
    Cumulative Flow Diagram: daily task-count per status for a project.
    Replays status-change activities to reconstruct per-day snapshots.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project_id = request.query_params.get("project_id")
        days       = int(request.query_params.get("days", 30))

        if not project_id:
            project = workspace.projects.filter(is_archived=False).order_by("created_at").first()
            if not project:
                return Response({"statuses": [], "data": []})
            project_id = str(project.id)

        project  = get_object_or_404(Project, id=project_id, workspace=workspace)
        statuses = list(project.statuses.order_by("order").values("id", "name", "color"))

        end_date   = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days - 1)

        # Build {task_id: [(date, status_id), ...]} from activities
        name_to_id = {s["name"]: s["id"] for s in statuses}
        id_set     = {s["id"] for s in statuses}

        acts = list(
            TaskActivity.objects
            .filter(task__project=project, verb=TaskActivity.Verb.STATUS)
            .order_by("task_id", "created_at")
            .values("task_id", "created_at", "meta")
        )

        # For each task: list of (date, status_id) transitions
        task_timeline = {}
        for act in acts:
            tid = str(act["task_id"])
            sid = name_to_id.get((act["meta"] or {}).get("to", ""))
            if sid:
                task_timeline.setdefault(tid, []).append(
                    (act["created_at"].date(), sid)
                )

        # Also fetch task creation dates and initial statuses
        tasks_info = Task.objects.filter(project=project).values(
            "id", "created_at", "status_id"
        )
        task_meta = {str(t["id"]): t for t in tasks_info}

        # Fill per-day buckets
        date_counts = {}
        cur = start_date
        while cur <= end_date:
            date_counts[cur] = {s["id"]: 0 for s in statuses}
            cur += datetime.timedelta(days=1)

        for tid, meta in task_meta.items():
            created_day = meta["created_at"].date()
            initial_sid = meta["status_id"]
            timeline    = task_timeline.get(tid, [])

            for day in date_counts:
                if day < created_day:
                    continue
                # Walk timeline to find status on this day
                current_sid = initial_sid
                for change_day, sid in timeline:
                    if change_day <= day:
                        current_sid = sid
                    else:
                        break
                if current_sid in date_counts[day]:
                    date_counts[day][current_sid] += 1

        data = []
        cur = start_date
        while cur <= end_date:
            row = {"date": cur.isoformat()}
            for s in statuses:
                row[s["name"]] = date_counts[cur].get(s["id"], 0)
            data.append(row)
            cur += datetime.timedelta(days=1)

        return Response({"statuses": statuses, "data": data})


class BurnupView(APIView):
    """
    Burnup chart: total scope vs completed tasks day by day.
    Scope by sprint (sprint_id) or entire project (project_id + days).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        sprint_id  = request.query_params.get("sprint_id")
        project_id = request.query_params.get("project_id")

        done_names = _done_status_names(workspace)

        if sprint_id:
            sprint     = get_object_or_404(Sprint, id=sprint_id, project__workspace=workspace)
            tasks_qs   = Task.objects.filter(sprint=sprint)
            start_date = sprint.start_date or (datetime.date.today() - datetime.timedelta(days=14))
            end_date   = sprint.end_date   or datetime.date.today()
        elif project_id:
            project    = get_object_or_404(Project, id=project_id, workspace=workspace)
            tasks_qs   = Task.objects.filter(project=project)
            days       = int(request.query_params.get("days", 30))
            end_date   = datetime.date.today()
            start_date = end_date - datetime.timedelta(days=days - 1)
        else:
            return Response({"error": "Provide sprint_id or project_id"}, status=400)

        today = datetime.date.today()
        data, cur = [], start_date

        while cur <= end_date:
            total = tasks_qs.filter(created_at__date__lte=cur).count()
            completed = (
                TaskActivity.objects
                .filter(
                    task__in=tasks_qs,
                    verb=TaskActivity.Verb.STATUS,
                    meta__to__in=done_names,
                    created_at__date__lte=cur,
                )
                .values("task")
                .distinct()
                .count()
            )
            data.append({
                "date":      cur.isoformat(),
                "total":     total,
                "completed": completed,
                "is_future": cur > today,
            })
            cur += datetime.timedelta(days=1)

        return Response({"data": data})


class WorkloadHeatmapView(APIView):
    """
    Workload heatmap: member × day grid showing tasks due per day.
    Default last 14 days.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        days       = int(request.query_params.get("days", 14))
        project_id = request.query_params.get("project_id")

        end_date   = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days - 1)
        dates      = []
        cur = start_date
        while cur <= end_date:
            dates.append(cur)
            cur += datetime.timedelta(days=1)

        members = workspace.members.select_related("user").all()
        rows    = []

        for member in members:
            user = member.user
            name = user.full_name or user.email.split("@")[0]

            qs = Task.objects.filter(project__workspace=workspace, assignee=user)
            if project_id:
                qs = qs.filter(project_id=project_id)

            # Assigned tasks with due_date in range
            assigned = list(qs.filter(
                due_date__gte=start_date, due_date__lte=end_date
            ).values("due_date"))

            day_counts = {d.isoformat(): 0 for d in dates}
            for t in assigned:
                k = t["due_date"].isoformat()
                if k in day_counts:
                    day_counts[k] += 1

            total = sum(day_counts.values())
            if total > 0:
                rows.append({
                    "user_id": str(user.id),
                    "name":    name,
                    "email":   user.email,
                    "days":    day_counts,
                    "total":   total,
                })

        return Response({
            "dates":   [d.isoformat() for d in dates],
            "members": rows,
        })


# ── Report Builder (v4.1.0) ───────────────────────────────────────────────────

_REPORT_DATA_SOURCES = {
    "tasks":        lambda ws, cfg: _report_tasks(ws, cfg),
    "time_entries": lambda ws, cfg: _report_time_entries(ws, cfg),
    "velocity":     lambda ws, cfg: _report_velocity(ws, cfg),
    "throughput":   lambda ws, cfg: _report_throughput(ws, cfg),
}


def _report_tasks(workspace, cfg):
    project_id = cfg.get("project_id")
    group_by   = cfg.get("group_by", "status")
    days       = int(cfg.get("date_range_days", 30))
    cutoff     = timezone.now() - datetime.timedelta(days=days)

    qs = Task.objects.filter(project__workspace=workspace, created_at__gte=cutoff)
    if project_id:
        qs = qs.filter(project_id=project_id)

    if group_by == "status":
        rows = list(
            qs.values("status__name", "status__color")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return [{"label": r["status__name"] or "No status", "value": r["count"], "color": r["status__color"]} for r in rows]
    elif group_by == "priority":
        rows = list(qs.values("priority").annotate(count=Count("id")).order_by("-count"))
        return [{"label": r["priority"] or "none", "value": r["count"]} for r in rows]
    elif group_by == "assignee":
        rows = list(
            qs.values("assignee__full_name", "assignee__email")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        return [
            {"label": r["assignee__full_name"] or (r["assignee__email"] or "Unassigned").split("@")[0],
             "value": r["count"]}
            for r in rows
        ]
    elif group_by == "task_type":
        rows = list(qs.values("task_type").annotate(count=Count("id")).order_by("-count"))
        return [{"label": r["task_type"] or "task", "value": r["count"]} for r in rows]

    return []


def _report_time_entries(workspace, cfg):
    project_id = cfg.get("project_id")
    group_by   = cfg.get("group_by", "member")
    days       = int(cfg.get("date_range_days", 30))
    cutoff     = timezone.now() - datetime.timedelta(days=days)

    qs = TimeEntry.objects.filter(
        task__project__workspace=workspace,
        start_at__gte=cutoff,
    ).exclude(end_at=None)
    if project_id:
        qs = qs.filter(task__project_id=project_id)

    if group_by == "member":
        rows = list(
            qs.values("user__full_name", "user__email")
            .annotate(total_seconds=Sum("duration_seconds"))
            .order_by("-total_seconds")
        )
        return [
            {
                "label": r["user__full_name"] or (r["user__email"] or "").split("@")[0],
                "value": round((r["total_seconds"] or 0) / 3600, 2),
            }
            for r in rows
        ]
    elif group_by == "project":
        rows = list(
            qs.values("task__project__name")
            .annotate(total_seconds=Sum("duration_seconds"))
            .order_by("-total_seconds")
        )
        return [
            {"label": r["task__project__name"] or "Unknown", "value": round((r["total_seconds"] or 0) / 3600, 2)}
            for r in rows
        ]

    return []


def _report_velocity(workspace, cfg):
    project_id = cfg.get("project_id")
    sprints_qs = Sprint.objects.filter(
        project__workspace=workspace, status=Sprint.Status.COMPLETED
    ).order_by("-end_date")[:8]
    if project_id:
        sprints_qs = sprints_qs.filter(project_id=project_id)
    done_ids = list(
        TaskStatus.objects.filter(project__workspace=workspace, is_done=True)
        .values_list("id", flat=True)
    )
    rows = []
    for sprint in reversed(list(sprints_qs)):
        done = Task.objects.filter(sprint=sprint, status_id__in=done_ids)
        sp   = done.aggregate(s=Sum("estimate_points"))["s"] or 0
        rows.append({"label": sprint.name, "value": done.count(), "story_points": sp})
    return rows


def _report_throughput(workspace, cfg):
    project_id = cfg.get("project_id")
    period     = cfg.get("period", "week")
    days       = int(cfg.get("date_range_days", 60))
    cutoff     = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)
    acts = TaskActivity.objects.filter(
        task__project__workspace=workspace,
        verb=TaskActivity.Verb.STATUS,
        meta__to__in=done_names,
        created_at__gte=cutoff,
    )
    if project_id:
        acts = acts.filter(task__project_id=project_id)
    trunc_fn = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(period, TruncWeek)
    rows = (
        acts
        .annotate(bucket=trunc_fn("created_at"))
        .values("bucket")
        .annotate(count=Count("task", distinct=True))
        .order_by("bucket")
    )
    return [
        {"label": str(r["bucket"].date() if hasattr(r["bucket"], "date") else r["bucket"]),
         "value": r["count"]}
        for r in rows
    ]


class ReportListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        reports   = Report.objects.filter(workspace=workspace, owner=request.user).order_by("-updated_at")
        return Response(ReportSerializer(reports, many=True).data)

    def post(self, request, workspace_slug):
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        serializer = ReportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        report = serializer.save(workspace=workspace, owner=request.user)
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_slug, report_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Report, id=report_id, workspace=workspace)

    def get(self, request, workspace_slug, report_id):
        return Response(ReportSerializer(self._get(workspace_slug, report_id, request.user)).data)

    def patch(self, request, workspace_slug, report_id):
        report = self._get(workspace_slug, report_id, request.user)
        s = ReportSerializer(report, data=request.data, partial=True)
        if not s.is_valid():
            return Response(s.errors, status=400)
        return Response(ReportSerializer(s.save()).data)

    def delete(self, request, workspace_slug, report_id):
        self._get(workspace_slug, report_id, request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportDataView(APIView):
    """Execute a report config and return chart-ready data."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, report_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        report    = get_object_or_404(Report, id=report_id, workspace=workspace)
        cfg       = report.config or {}
        source    = cfg.get("data_source", "tasks")
        fn        = _REPORT_DATA_SOURCES.get(source)
        if not fn:
            return Response({"error": f"Unknown data source: {source}"}, status=400)
        return Response({"data": fn(workspace, cfg), "config": cfg})


class ReportShareCreateView(APIView):
    """Create or retrieve the public share link for a report."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, report_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        report    = get_object_or_404(Report, id=report_id, workspace=workspace)
        share, _  = ReportShare.objects.get_or_create(report=report)
        return Response(ReportShareSerializer(share).data)

    def delete(self, request, workspace_slug, report_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        report    = get_object_or_404(Report, id=report_id, workspace=workspace)
        ReportShare.objects.filter(report=report).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ScheduledReportListCreateView(APIView):
    """List + create schedules for a report."""
    permission_classes = [permissions.IsAuthenticated]

    def _report(self, workspace_slug, report_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Report, id=report_id, workspace=workspace)

    def get(self, request, workspace_slug, report_id):
        report = self._report(workspace_slug, report_id, request.user)
        return Response(ScheduledReportSerializer(report.schedules.all(), many=True).data)

    def post(self, request, workspace_slug, report_id):
        report = self._report(workspace_slug, report_id, request.user)
        s      = ScheduledReportSerializer(data=request.data)
        if not s.is_valid():
            return Response(s.errors, status=400)
        return Response(ScheduledReportSerializer(s.save(report=report)).data, status=201)


# ── CSV Export (v1.7.0) ───────────────────────────────────────────────────────

class TaskExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        tasks     = Task.objects.filter(project=project).select_related(
            "status", "assignee", "sprint", "created_by"
        ).prefetch_related("labels")

        response = HttpResponse(content_type="text/csv")
        safe_name = project.name.replace(" ", "_")
        response["Content-Disposition"] = f'attachment; filename="{safe_name}-tasks.csv"'

        writer = csv.writer(response)
        writer.writerow(["ID", "Title", "Status", "Priority", "Assignee", "Due Date", "Sprint", "Labels", "Created"])
        for task in tasks:
            writer.writerow([
                str(task.id)[:8],
                task.title,
                task.status.name if task.status else "",
                task.get_priority_display(),
                task.assignee.full_name if task.assignee else "",
                str(task.due_date) if task.due_date else "",
                task.sprint.name if task.sprint else "",
                ", ".join(l.name for l in task.labels.all()),
                task.created_at.strftime("%Y-%m-%d"),
            ])
        return response


# ── v2.1.0 — Project Members & Permissions ────────────────────────────────────

def _require_project_admin(request, workspace_slug, project_id):
    """Return (workspace, project) or raise 403/404."""
    workspace = get_workspace_for_user(workspace_slug, request.user)
    project   = get_object_or_404(Project, id=project_id, workspace=workspace)
    if not has_project_permission(request.user, project, "admin"):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("Project admin role required.")
    return workspace, project


class ProjectMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "view"):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        members = project.project_members.select_related("user")
        return Response(ProjectMemberSerializer(members, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace, project = _require_project_admin(request, workspace_slug, project_id)
        serializer = ProjectMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save(project=project, added_by=request.user)
        log_audit(
            actor=request.user, workspace=workspace,
            action="project_member.added", resource_type="project_member",
            resource_id=member.id, after={"user": str(member.user_id), "role": member.role},
        )
        return Response(ProjectMemberSerializer(member).data, status=status.HTTP_201_CREATED)


class ProjectMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_member(self, workspace_slug, project_id, member_id, request):
        workspace, project = _require_project_admin(request, workspace_slug, project_id)
        member = get_object_or_404(ProjectMember, id=member_id, project=project)
        return workspace, project, member

    def patch(self, request, workspace_slug, project_id, member_id):
        workspace, project, member = self._get_member(workspace_slug, project_id, member_id, request)
        before_role = member.role
        new_role = request.data.get("role")
        if new_role not in [r.value for r in ProjectMember.Role]:
            return Response({"role": "Invalid role."}, status=status.HTTP_400_BAD_REQUEST)
        member.role = new_role
        member.save(update_fields=["role"])
        log_audit(
            actor=request.user, workspace=workspace,
            action="project_member.role_changed", resource_type="project_member",
            resource_id=member.id,
            before={"role": before_role}, after={"role": new_role},
        )
        return Response(ProjectMemberSerializer(member).data)

    def delete(self, request, workspace_slug, project_id, member_id):
        workspace, project, member = self._get_member(workspace_slug, project_id, member_id, request)
        log_audit(
            actor=request.user, workspace=workspace,
            action="project_member.removed", resource_type="project_member",
            resource_id=member.id,
            before={"user": str(member.user_id), "role": member.role},
        )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GuestTokenListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace, project = _require_project_admin(request, workspace_slug, project_id)
        tokens = project.guest_tokens.filter(is_active=True)
        return Response(GuestTokenSerializer(tokens, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace, project = _require_project_admin(request, workspace_slug, project_id)
        serializer = GuestTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = serializer.save(project=project, created_by=request.user)
        log_audit(
            actor=request.user, workspace=workspace,
            action="guest_token.created", resource_type="guest_token",
            resource_id=token.id,
            after={"label": token.label, "expires_at": str(token.expires_at)},
        )
        return Response(GuestTokenSerializer(token).data, status=status.HTTP_201_CREATED)


class GuestTokenDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, project_id, token_id):
        workspace, project = _require_project_admin(request, workspace_slug, project_id)
        token = get_object_or_404(GuestToken, id=token_id, project=project)
        log_audit(
            actor=request.user, workspace=workspace,
            action="guest_token.revoked", resource_type="guest_token",
            resource_id=token.id,
        )
        token.is_active = False
        token.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectPermissionsView(APIView):
    """Return the current user's effective role for a project — used by frontend hooks."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        role = get_effective_role(request.user, project)
        if role is None:
            return Response({"detail": "Not a member."}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            "role": role,
            "can_view":   has_project_permission(request.user, project, "view"),
            "can_edit":   has_project_permission(request.user, project, "edit"),
            "can_delete": has_project_permission(request.user, project, "delete"),
            "can_admin":  has_project_permission(request.user, project, "admin"),
        })


# ── v2.2.0 — Multi-Board Architecture ────────────────────────────────────────

class BoardListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        boards    = project.boards.filter(is_archived=False)
        return Response(BoardSerializer(boards, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required to create boards.")

        # Apply template config if requested
        template_key = request.data.get("template_key")
        extra = {}
        if template_key:
            tmpl = next((t for t in BOARD_TEMPLATES if t["key"] == template_key), None)
            if tmpl:
                extra = {
                    "name":        request.data.get("name", tmpl["name"]),
                    "description": tmpl["description"],
                    "board_type":  tmpl["board_type"],
                    "config":      tmpl["config"],
                }

        data = {**request.data, **extra}
        serializer = BoardSerializer(data=data)
        serializer.is_valid(raise_exception=True)

        # Determine order
        last_order = project.boards.aggregate(m=django_models.Max("order"))["m"] or 0
        board = serializer.save(project=project, created_by=request.user, order=last_order + 1)
        return Response(BoardSerializer(board).data, status=status.HTTP_201_CREATED)


class BoardDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_board(self, workspace_slug, project_id, board_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        board     = get_object_or_404(Board, id=board_id, project=project)
        return workspace, project, board

    def patch(self, request, workspace_slug, project_id, board_id):
        workspace, project, board = self._get_board(workspace_slug, project_id, board_id, request.user)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")

        # Enforce single default
        if request.data.get("is_default"):
            project.boards.filter(is_default=True).update(is_default=False)

        serializer = BoardSerializer(board, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, board_id):
        workspace, project, board = self._get_board(workspace_slug, project_id, board_id, request.user)
        if not has_project_permission(request.user, project, "admin"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin role required to delete boards.")
        if board.is_default:
            return Response({"detail": "Cannot delete the default board."}, status=status.HTTP_400_BAD_REQUEST)
        board.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BoardArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, board_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        board     = get_object_or_404(Board, id=board_id, project=project)
        if not has_project_permission(request.user, project, "admin"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin role required.")
        if board.is_default:
            return Response({"detail": "Cannot archive the default board."}, status=status.HTTP_400_BAD_REQUEST)
        board.is_archived = not board.is_archived
        board.save(update_fields=["is_archived"])
        return Response(BoardSerializer(board).data)


class BoardTemplatesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        # Just validate membership
        get_workspace_for_user(workspace_slug, request.user)
        return Response(BOARD_TEMPLATES)


class BoardReorderView(APIView):
    """Accept [{id, order}] list and bulk-update order field."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        for item in request.data:
            Board.objects.filter(id=item["id"], project=project).update(order=item["order"])
        boards = project.boards.filter(is_archived=False)
        return Response(BoardSerializer(boards, many=True).data)


# ── v2.4.0 — Advanced Task System ────────────────────────────────────────────

class TaskCloneView(APIView):
    """POST /tasks/:id/clone/ — deep-clone a task and return the new task."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        task      = get_object_or_404(Task, id=task_id, project=project)
        new_task  = task.clone(created_by=request.user)
        log_activity(new_task, request.user, TaskActivity.Verb.CREATED, {"cloned_from": str(task.id)})
        broadcast(workspace_slug, "task.created", TaskSerializer(new_task, context={"request": request}).data)
        return Response(TaskSerializer(new_task, context={"request": request}).data, status=status.HTTP_201_CREATED)


class TaskChildrenView(APIView):
    """GET /tasks/:id/children/ — list direct child tasks."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        children  = task.children.select_related("status", "assignee").all()
        return Response(TaskSerializer(children, many=True, context={"request": request}).data)

    def post(self, request, workspace_slug, project_id, task_id):
        """Create a child task under this parent."""
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        parent = get_object_or_404(Task, id=task_id, project=project)
        data   = request.data.copy()
        data["parent_id"] = str(parent.id)
        serializer = TaskSerializer(data=data, context={"request": request, "project": project})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(project=project, created_by=request.user, parent=parent)
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        broadcast(workspace_slug, "task.created", serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskTemplateListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        templates = project.task_templates.all()
        return Response(TaskTemplateSerializer(templates, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = TaskTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(project=project, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskTemplateDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_slug, project_id, template_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        template  = get_object_or_404(TaskTemplate, id=template_id, project=project)
        serializer = TaskTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, template_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        template  = get_object_or_404(TaskTemplate, id=template_id, project=project)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskApplyTemplateView(APIView):
    """POST /tasks/:id/apply-template/ — apply a template to an existing task (fills subtasks)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, task_id):
        workspace   = get_workspace_for_user(workspace_slug, request.user)
        project     = get_object_or_404(Project, id=project_id, workspace=workspace)
        task        = get_object_or_404(Task, id=task_id, project=project)
        template_id = request.data.get("template_id")
        template    = get_object_or_404(TaskTemplate, id=template_id, project=project)
        for i, sub in enumerate(template.default_subtasks):
            SubTask.objects.get_or_create(task=task, title=sub.get("title", ""), defaults={"order": i})
        return Response(TaskDetailSerializer(task, context={"request": request}).data)


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────

class WikiPageListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        pages     = project.wiki_pages.filter(parent=None).prefetch_related("children")
        return Response(WikiPageSerializer(pages, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = WikiPageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        page = serializer.save(project=project, created_by=request.user)
        return Response(WikiPageSerializer(page).data, status=status.HTTP_201_CREATED)


class WikiPageDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_page(self, workspace_slug, project_id, page_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(WikiPage, id=page_id, project=project), project

    def get(self, request, workspace_slug, project_id, page_id):
        page, _ = self._get_page(workspace_slug, project_id, page_id, request.user)
        return Response(WikiPageSerializer(page).data)

    def patch(self, request, workspace_slug, project_id, page_id):
        page, project = self._get_page(workspace_slug, project_id, page_id, request.user)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        # Save a revision before updating
        WikiRevision.objects.create(page=page, content=page.content, title=page.title, author=request.user)
        serializer = WikiPageSerializer(page, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, page_id):
        page, project = self._get_page(workspace_slug, project_id, page_id, request.user)
        if not has_project_permission(request.user, project, "admin"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin role required.")
        page.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WikiPageRevisionsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, page_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        page      = get_object_or_404(WikiPage, id=page_id, project=project)
        revisions = page.revisions.select_related("author")[:20]
        return Response(WikiRevisionSerializer(revisions, many=True).data)


class DocumentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        docs      = workspace.documents.select_related("created_by")
        return Response(DocumentSerializer(docs, many=True).data)

    def post(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        serializer = DocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class DocumentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_doc(self, workspace_slug, doc_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Document, id=doc_id, workspace=workspace)

    def get(self, request, workspace_slug, doc_id):
        doc = self._get_doc(workspace_slug, doc_id, request.user)
        return Response(DocumentSerializer(doc).data)

    def patch(self, request, workspace_slug, doc_id):
        doc = self._get_doc(workspace_slug, doc_id, request.user)
        serializer = DocumentSerializer(doc, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, doc_id):
        doc = self._get_doc(workspace_slug, doc_id, request.user)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────

class FormListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        forms     = project.forms.prefetch_related("fields")
        return Response(FormSerializer(forms, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = FormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        form = serializer.save(project=project, created_by=request.user)
        return Response(FormSerializer(form).data, status=status.HTTP_201_CREATED)


class FormDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_form(self, workspace_slug, project_id, form_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Form, id=form_id, project=project), project

    def get(self, request, workspace_slug, project_id, form_id):
        form, _ = self._get_form(workspace_slug, project_id, form_id, request.user)
        return Response(FormSerializer(form).data)

    def patch(self, request, workspace_slug, project_id, form_id):
        form, project = self._get_form(workspace_slug, project_id, form_id, request.user)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = FormSerializer(form, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, form_id):
        form, project = self._get_form(workspace_slug, project_id, form_id, request.user)
        if not has_project_permission(request.user, project, "admin"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin role required.")
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FormFieldsBulkUpdateView(APIView):
    """PUT /forms/:id/fields/ — replace all fields in one shot (drag-drop reorder support)."""
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, workspace_slug, project_id, form_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        form = get_object_or_404(Form, id=form_id, project=project)
        form.fields.all().delete()
        new_fields = []
        for i, f in enumerate(request.data):
            new_fields.append(FormField(
                form=form,
                label=f.get("label", ""),
                field_type=f.get("field_type", "short_text"),
                placeholder=f.get("placeholder", ""),
                is_required=f.get("is_required", False),
                options=f.get("options", []),
                order=i,
            ))
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
        answers         = request.data.get("answers", {})
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
            title = answers.get(title_field_id, "") if title_field_id else f"Submission from {submitter_email or 'form'}"
            if not title:
                title = f"Form submission — {form.name}"
            status_id = cfg.get("default_status_id")
            task_status = None
            if status_id:
                try:
                    task_status = TaskStatus.objects.get(id=status_id, project=form.project)
                except TaskStatus.DoesNotExist:
                    task_status = form.project.statuses.first()
            else:
                task_status = form.project.statuses.first()

            task = Task.objects.create(
                project=form.project,
                title=title[:500],
                description=f"**Via form:** {form.name}\n\n**Submitter:** {submitter_email}",
                status=task_status,
                created_by=None,
            )
            submission.task = task
            submission.save(update_fields=["task"])

        return Response({"success": True, "submission_id": str(submission.id)}, status=status.HTTP_201_CREATED)


class FormSubmissionListView(APIView):
    """GET /forms/:id/submissions/ — authenticated, returns all submissions."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, form_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        form      = get_object_or_404(Form, id=form_id, project=project)
        subs      = form.submissions.select_related("task").order_by("-submitted_at")
        return Response(FormSubmissionSerializer(subs, many=True).data)

    def patch(self, request, workspace_slug, project_id, form_id):
        """Update a submission status."""
        workspace  = get_workspace_for_user(workspace_slug, request.user)
        project    = get_object_or_404(Project, id=project_id, workspace=workspace)
        form       = get_object_or_404(Form, id=form_id, project=project)
        sub_id     = request.data.get("id")
        sub        = get_object_or_404(FormSubmission, id=sub_id, form=form)
        new_status = request.data.get("status")
        if new_status in [s[0] for s in FormSubmission.Status.choices]:
            sub.status = new_status
            sub.save(update_fields=["status"])
        return Response(FormSubmissionSerializer(sub).data)


# ── v2.7.0 — Automation Engine ────────────────────────────────────────────────

class AutomationRuleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        rules     = project.automation_rules.all()
        return Response(AutomationRuleSerializer(rules, many=True).data)

    def post(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = AutomationRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(project=project, created_by=request.user)
        return Response(AutomationRuleSerializer(rule).data, status=status.HTTP_201_CREATED)


class AutomationRuleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_rule(self, workspace_slug, project_id, rule_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(AutomationRule, id=rule_id, project=project), project

    def patch(self, request, workspace_slug, project_id, rule_id):
        rule, project = self._get_rule(workspace_slug, project_id, rule_id, request.user)
        if not has_project_permission(request.user, project, "edit"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Editor role required.")
        serializer = AutomationRuleSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, project_id, rule_id):
        rule, project = self._get_rule(workspace_slug, project_id, rule_id, request.user)
        if not has_project_permission(request.user, project, "admin"):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Admin role required.")
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AutomationLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, rule_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        rule      = get_object_or_404(AutomationRule, id=rule_id, project=project)
        logs      = rule.logs.order_by("-created_at")[:50]
        return Response(AutomationLogSerializer(logs, many=True).data)


# ── v2.8.0 — Time Tracking ────────────────────────────────────────────────────

class TimeEntryListCreateView(APIView):
    """GET + POST manual time entries for a task."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        entries   = task.time_entries.select_related("user").all()
        return Response(TimeEntrySerializer(entries, many=True).data)

    def post(self, request, workspace_slug, project_id, task_id):
        """Manual time entry — requires duration_seconds."""
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        entry = TimeEntry.objects.create(
            task=task,
            user=request.user,
            duration_seconds=request.data.get("duration_seconds", 0),
            description=request.data.get("description", ""),
            is_billable=request.data.get("is_billable", False),
        )
        return Response(TimeEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class TimeEntryDeleteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, project_id, task_id, entry_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        entry     = get_object_or_404(TimeEntry, id=entry_id, task=task, user=request.user)
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TimerStartView(APIView):
    """POST — start a timer on a task. Stops any currently running timer for this user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, task_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)

        # Stop any existing running timer for this user
        running = TimeEntry.objects.filter(user=request.user, end_at__isnull=True, start_at__isnull=False)
        for r in running:
            r.stop()

        entry = TimeEntry.objects.create(
            task=task,
            user=request.user,
            start_at=timezone.now(),
            description=request.data.get("description", ""),
            is_billable=request.data.get("is_billable", False),
        )
        return Response(TimeEntrySerializer(entry).data, status=status.HTTP_201_CREATED)


class TimerStopView(APIView):
    """PATCH — stop the currently running timer."""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_slug):
        get_workspace_for_user(workspace_slug, request.user)
        running = TimeEntry.objects.filter(user=request.user, end_at__isnull=True, start_at__isnull=False).first()
        if not running:
            return Response({"detail": "No active timer."}, status=status.HTTP_404_NOT_FOUND)
        running.stop()
        return Response(TimeEntrySerializer(running).data)


class TimerActiveView(APIView):
    """GET — return the currently running timer for this user (if any)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        get_workspace_for_user(workspace_slug, request.user)
        running = TimeEntry.objects.filter(user=request.user, end_at__isnull=True, start_at__isnull=False).select_related("task").first()
        if not running:
            return Response(None)
        return Response(TimeEntrySerializer(running).data)


class TimesheetView(APIView):
    """GET /timesheets/ — weekly logged hours per member per day."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        from django.db.models import Sum
        import datetime as dt

        workspace = get_workspace_for_user(workspace_slug, request.user)
        week_str  = request.query_params.get("week")  # YYYY-Www

        if week_str:
            try:
                year, week = week_str.split("-W")
                start_date = dt.datetime.strptime(f"{year}-W{week}-1", "%Y-W%W-%w").date()
            except (ValueError, AttributeError):
                start_date = timezone.now().date() - dt.timedelta(days=timezone.now().weekday())
        else:
            start_date = timezone.now().date() - dt.timedelta(days=timezone.now().weekday())

        end_date = start_date + dt.timedelta(days=6)

        entries = (
            TimeEntry.objects
            .filter(
                task__project__workspace=workspace,
                created_at__date__gte=start_date,
                created_at__date__lte=end_date,
                end_at__isnull=False,
            )
            .select_related("user", "task")
        )

        # Group by user + day
        from collections import defaultdict
        grid = defaultdict(lambda: defaultdict(int))
        users = {}
        for entry in entries:
            uid = str(entry.user_id)
            users[uid] = {"id": uid, "name": entry.user.full_name or entry.user.email}
            day_key = str(entry.created_at.date())
            grid[uid][day_key] += entry.duration_seconds

        days = [(start_date + dt.timedelta(days=i)).isoformat() for i in range(7)]
        rows = [
            {
                "user": users[uid],
                "days": {day: grid[uid].get(day, 0) for day in days},
                "total": sum(grid[uid].values()),
            }
            for uid in users
        ]

        return Response({"week_start": str(start_date), "days": days, "rows": rows})


# ── v2.9.0 — iCal export ──────────────────────────────────────────────────────
class CalendarICSView(APIView):
    """GET /projects/:id/calendar.ics/ — subscribable iCal feed for the project."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, project_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        tasks     = project.tasks.filter(due_date__isnull=False).select_related("status", "assignee")

        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            f"PRODID:-//JCN//{project.name}//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
        ]
        for task in tasks:
            dt_str = task.due_date.strftime("%Y%m%d")
            summary = task.title.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            lines += [
                "BEGIN:VEVENT",
                f"UID:{task.id}@jcn",
                f"SUMMARY:{summary}",
                f"DTSTART;VALUE=DATE:{dt_str}",
                f"DTEND;VALUE=DATE:{dt_str}",
                f"STATUS:{'COMPLETED' if task.status and task.status.is_done else 'NEEDS-ACTION'}",
                "END:VEVENT",
            ]
        lines.append("END:VCALENDAR")

        content = "\r\n".join(lines) + "\r\n"
        response = HttpResponse(content, content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{project.name}-calendar.ics"'
        return response


# ── v3.3.0 — Custom Dashboards ────────────────────────────────────────────────
def _ensure_builtin_dashboards(workspace):
    """Create the two non-deletable built-in dashboards if they don't exist yet."""
    if not Dashboard.objects.filter(workspace=workspace, is_builtin=True).exists():
        Dashboard.objects.bulk_create([
            Dashboard(workspace=workspace, name="Overview",  is_builtin=True, order=0, widgets=[]),
            Dashboard(workspace=workspace, name="Analytics", is_builtin=True, order=1, widgets=[]),
        ])


class DashboardListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        _ensure_builtin_dashboards(workspace)
        dashboards = workspace.dashboards.all()
        return Response(DashboardSerializer(dashboards, many=True).data)

    def post(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        serializer = DashboardSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dashboard = serializer.save(workspace=workspace, created_by=request.user)
        return Response(DashboardSerializer(dashboard).data, status=status.HTTP_201_CREATED)


class DashboardDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_slug, dashboard_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Dashboard, id=dashboard_id, workspace=workspace)

    def get(self, request, workspace_slug, dashboard_id):
        d = self._get(workspace_slug, dashboard_id, request.user)
        return Response(DashboardSerializer(d).data)

    def patch(self, request, workspace_slug, dashboard_id):
        d = self._get(workspace_slug, dashboard_id, request.user)
        serializer = DashboardSerializer(d, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DashboardSerializer(d).data)

    def delete(self, request, workspace_slug, dashboard_id):
        d = self._get(workspace_slug, dashboard_id, request.user)
        if d.is_builtin:
            return Response({"error": "Built-in dashboards cannot be deleted."}, status=status.HTTP_403_FORBIDDEN)
        d.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v3.4.0 — My Work ─────────────────────────────────────────────────────────
class MyWorkView(APIView):
    """GET /my-work/ — all tasks assigned to the current user, across all workspaces, sorted by urgency."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_ids = WorkspaceMember.objects.filter(user=request.user).values_list("workspace_id", flat=True)
        tasks = (
            Task.objects
            .filter(project__workspace_id__in=workspace_ids, assignee=request.user)
            .exclude(status__is_done=True)
            .select_related("status", "assignee", "sprint", "project__workspace")
            .prefetch_related("labels", "blocked_by_deps")
        )

        today    = timezone.now().date()
        week_end = today + datetime.timedelta(days=7)

        def urgency(t):
            score = 0
            if t.due_date:
                d = t.due_date
                if d < today:     score += 100
                elif d == today:  score += 30
                elif d <= week_end: score += 10
            if t.priority == "urgent": score += 50
            elif t.priority == "high": score += 20
            return score

        sorted_tasks = sorted(tasks, key=lambda t: -urgency(t))
        return Response(MyWorkTaskSerializer(sorted_tasks, many=True, context={"request": request}).data)


# ── v3.4.0 — Portfolio ────────────────────────────────────────────────────────
class PortfolioView(APIView):
    """GET /portfolio/ — cross-project health stats for a workspace."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        projects  = Project.objects.filter(workspace=workspace, status=Project.Status.ACTIVE).prefetch_related("tasks", "tasks__status", "sprints")
        today = timezone.now().date()

        def health(p):
            tasks       = p.tasks.all()
            total       = tasks.count()
            done        = tasks.filter(status__is_done=True).count()
            overdue     = tasks.filter(due_date__lt=today, status__is_done=False).count()
            overdue_pct = (overdue / total * 100) if total else 0
            if overdue_pct > 25:  return "off_track"
            if overdue_pct > 10:  return "at_risk"
            return "on_track"

        data = []
        for p in projects:
            tasks   = p.tasks.all()
            total   = tasks.count()
            done    = tasks.filter(status__is_done=True).count()
            overdue = tasks.filter(due_date__lt=today, status__is_done=False).count()
            sprints = p.sprints.filter(status="active").values("id", "name", "start_date", "end_date")
            data.append({
                "id":           str(p.id),
                "name":         p.name,
                "health":       health(p),
                "total_tasks":  total,
                "done_tasks":   done,
                "overdue_tasks": overdue,
                "completion_pct": round(done / total * 100) if total else 0,
                "active_sprints": list(sprints),
            })

        return Response(data)


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

    def get(self, request, workspace_slug):
        workspace = self._get_workspace(workspace_slug, request.user)
        resource_type = request.query_params.get("resource_type")
        resource_id   = request.query_params.get("resource_id")
        cutoff = timezone.now() - datetime.timedelta(seconds=90)
        qs = workspace.presences.filter(last_seen__gte=cutoff).select_related("user")
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return Response(UserPresenceSerializer(qs, many=True).data)

    def post(self, request, workspace_slug):
        workspace     = self._get_workspace(workspace_slug, request.user)
        resource_type = request.data.get("resource_type", UserPresence.ResourceType.PROJECT)
        resource_id   = str(request.data.get("resource_id", ""))
        if not resource_id:
            return Response({"detail": "resource_id required."}, status=status.HTTP_400_BAD_REQUEST)

        # last_seen is auto_now, so update_or_create already stamps it on save.
        # Avoid a separate update + refresh_from_db, which races with a concurrent
        # DELETE (leave) and raises UserPresence.DoesNotExist.
        presence, _ = UserPresence.objects.update_or_create(
            user=request.user, workspace=workspace,
            resource_type=resource_type, resource_id=resource_id,
            defaults={},
        )

        data = UserPresenceSerializer(presence).data
        broadcast(workspace_slug, "presence.updated", {
            "resource_type": resource_type,
            "resource_id": resource_id,
            "user": data["user"],
            "last_seen": data["last_seen"],
            "action": "join",
        })
        return Response(data)

    def delete(self, request, workspace_slug):
        workspace     = self._get_workspace(workspace_slug, request.user)
        resource_type = request.data.get("resource_type")
        resource_id   = str(request.data.get("resource_id", ""))

        qs = UserPresence.objects.filter(user=request.user, workspace=workspace)
        if resource_type and resource_id:
            qs = qs.filter(resource_type=resource_type, resource_id=resource_id)
        qs.delete()

        if resource_type and resource_id:
            from accounts.serializers import UserSerializer as AccUserSerializer
            broadcast(workspace_slug, "presence.updated", {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "user": AccUserSerializer(request.user).data,
                "action": "leave",
            })
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentReactionToggleView(APIView):
    """
    POST /tasks/:id/comments/:comment_id/reactions/
    Body: { "emoji": "👍" }
    Toggles the reaction — creates if absent, deletes if present.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_comment(self, workspace_slug, project_id, task_id, comment_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        return get_object_or_404(TaskComment, id=comment_id, task=task)

    def post(self, request, workspace_slug, project_id, task_id, comment_id):
        comment = self._get_comment(workspace_slug, project_id, task_id, comment_id, request.user)
        emoji   = request.data.get("emoji", "").strip()
        if not emoji:
            return Response({"detail": "emoji required."}, status=status.HTTP_400_BAD_REQUEST)

        existing = CommentReaction.objects.filter(comment=comment, user=request.user, emoji=emoji).first()
        if existing:
            existing.delete()
            action = "removed"
        else:
            CommentReaction.objects.create(comment=comment, user=request.user, emoji=emoji)
            action = "added"

        grouped = {}
        for r in comment.reactions.select_related("user").all():
            grouped.setdefault(r.emoji, []).append({
                "id": str(r.id),
                "user_id": str(r.user_id),
                "name": r.user.full_name or r.user.email,
            })

        broadcast(workspace_slug, "reaction.updated", {
            "comment_id": str(comment.id),
            "task_id":    str(task_id),
            "project_id": str(project_id),
            "reactions":  grouped,
            "action":     action,
            "emoji":      emoji,
        })
        return Response({"reactions": grouped, "action": action})


# ── v3.6.0 — Approval Workflows ──────────────────────────────────────────────

class ApprovalListCreateView(APIView):
    """
    GET  /tasks/:id/approvals/  — list all approvals for a task
    POST /tasks/:id/approvals/  — request a new approval
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_task(self, workspace_slug, project_id, task_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, project=project)

    def get(self, request, workspace_slug, project_id, task_id):
        task = self._get_task(workspace_slug, project_id, task_id, request.user)
        approvals = task.approvals.prefetch_related("reviewers__user").select_related("requested_by")
        return Response(ApprovalSerializer(approvals, many=True).data)

    def post(self, request, workspace_slug, project_id, task_id):
        task = self._get_task(workspace_slug, project_id, task_id, request.user)
        serializer = ApprovalSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        approval = serializer.save(task=task, requested_by=request.user)

        # Notify every reviewer
        workspace = task.project.workspace
        for reviewer in approval.reviewers.select_related("user"):
            notify(
                recipient=reviewer.user,
                actor=request.user,
                verb=Notification.Verb.APPROVAL_REQUESTED,
                workspace=workspace,
                task=task,
            )

        broadcast(workspace_slug, "approval.created", {
            "task_id":    str(task_id),
            "project_id": str(project_id),
            "approval":   ApprovalSerializer(approval).data,
        })
        return Response(ApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)


class ApprovalReviewView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/review/
    Body: { "status": "approved"|"rejected"|"changes_requested", "comment": "..." }
    Only the designated reviewer can submit their verdict.
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_approval(self, workspace_slug, project_id, task_id, approval_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        return get_object_or_404(
            Approval.objects.prefetch_related("reviewers__user").select_related("requested_by"),
            id=approval_id, task=task,
        )

    def post(self, request, workspace_slug, project_id, task_id, approval_id):
        approval = self._get_approval(workspace_slug, project_id, task_id, approval_id, request.user)

        reviewer = approval.reviewers.filter(user=request.user).first()
        if not reviewer:
            return Response({"detail": "You are not a reviewer on this approval."}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get("status")
        valid_statuses = [
            ApprovalReviewer.Status.APPROVED,
            ApprovalReviewer.Status.REJECTED,
            ApprovalReviewer.Status.CHANGES_REQUESTED,
        ]
        if new_status not in valid_statuses:
            return Response({"detail": f"status must be one of: {', '.join(valid_statuses)}"}, status=status.HTTP_400_BAD_REQUEST)

        reviewer.status      = new_status
        reviewer.comment     = request.data.get("comment", "")
        reviewer.reviewed_at = timezone.now()
        reviewer.save(update_fields=["status", "comment", "reviewed_at"])

        # Recompute overall approval status
        old_overall = approval.status
        approval.recompute_status()

        data = ApprovalSerializer(approval).data
        broadcast(workspace_slug, "approval.updated", {
            "task_id":    str(task_id),
            "project_id": str(project_id),
            "approval":   data,
        })

        # Fire automation triggers when overall status changes
        if approval.status != old_overall:
            from .automation import fire_automation
            trigger = None
            if approval.status == Approval.Status.APPROVED:
                trigger = "approval.approved"
            elif approval.status == Approval.Status.REJECTED:
                trigger = "approval.rejected"
            if trigger:
                fire_automation(trigger, approval.task, actor=request.user, context={"approval_id": str(approval_id)})

        return Response(data)


class ApprovalResubmitView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/resubmit/
    Resets a changes_requested or rejected approval back to pending so reviewers
    can re-evaluate without the assignee creating a duplicate approval record.
    Only the original requester may resubmit.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, project_id, task_id, approval_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        project   = get_object_or_404(Project, id=project_id, workspace=workspace)
        task      = get_object_or_404(Task, id=task_id, project=project)
        approval  = get_object_or_404(Approval, id=approval_id, task=task)

        if approval.requested_by != request.user:
            return Response({"detail": "Only the original requester can resubmit."}, status=status.HTTP_403_FORBIDDEN)

        if approval.status == Approval.Status.APPROVED:
            return Response({"detail": "This approval is already approved."}, status=status.HTTP_400_BAD_REQUEST)

        # Reset the approval and all individual reviewer verdicts back to pending
        approval.status = Approval.Status.PENDING
        approval.save(update_fields=["status", "updated_at"])
        approval.reviewers.all().update(status=ApprovalReviewer.Status.PENDING, comment="")

        # Notify each reviewer again
        for reviewer in approval.reviewers.select_related("user"):
            notify(
                recipient=reviewer.user,
                actor=request.user,
                verb=Notification.Verb.APPROVAL_REQUESTED,
                workspace=workspace,
                task=task,
            )

        broadcast(workspace_slug, "approval.updated", {
            "task_id":    str(task_id),
            "project_id": str(project_id),
            "approval":   ApprovalSerializer(approval).data,
        })

        return Response(ApprovalSerializer(approval).data)


# ── v3.8.0 — OKR & Goal Tracking ─────────────────────────────────────────────

class ObjectiveListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/"""
    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_workspace_for_user(slug, user)

    def get(self, request, workspace_slug):
        workspace   = self._get_workspace(workspace_slug, request.user)
        time_period = request.query_params.get("time_period")
        qs = Objective.objects.filter(workspace=workspace).prefetch_related(
            "key_results__tasks", "owner"
        )
        if time_period and time_period != "all":
            qs = qs.filter(time_period=time_period)
        return Response(ObjectiveSerializer(qs, many=True, context={"request": request}).data)

    def post(self, request, workspace_slug):
        workspace  = self._get_workspace(workspace_slug, request.user)
        serializer = ObjectiveSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        obj = serializer.save(workspace=workspace, owner=request.user)
        return Response(ObjectiveSerializer(obj, context={"request": request}).data, status=status.HTTP_201_CREATED)


class ObjectiveDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/"""
    permission_classes = [permissions.IsAuthenticated]

    def _get_obj(self, workspace_slug, obj_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(
            Objective.objects.prefetch_related("key_results__tasks").select_related("owner"),
            id=obj_id, workspace=workspace,
        )

    def get(self, request, workspace_slug, obj_id):
        obj = self._get_obj(workspace_slug, obj_id, request.user)
        return Response(ObjectiveSerializer(obj, context={"request": request}).data)

    def patch(self, request, workspace_slug, obj_id):
        obj = self._get_obj(workspace_slug, obj_id, request.user)
        serializer = ObjectiveSerializer(obj, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_slug, obj_id):
        obj = self._get_obj(workspace_slug, obj_id, request.user)
        obj.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class KeyResultListCreateView(APIView):
    """GET/POST /workspaces/:slug/objectives/:obj_id/key-results/"""
    permission_classes = [permissions.IsAuthenticated]

    def _get_objective(self, workspace_slug, obj_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(Objective, id=obj_id, workspace=workspace)

    def get(self, request, workspace_slug, obj_id):
        obj = self._get_objective(workspace_slug, obj_id, request.user)
        return Response(KeyResultSerializer(
            obj.key_results.prefetch_related("tasks"), many=True
        ).data)

    def post(self, request, workspace_slug, obj_id):
        obj        = self._get_objective(workspace_slug, obj_id, request.user)
        serializer = KeyResultSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        kr = serializer.save(objective=obj)
        return Response(KeyResultSerializer(kr).data, status=status.HTTP_201_CREATED)


class KeyResultDetailView(APIView):
    """GET/PATCH/DELETE /workspaces/:slug/objectives/:obj_id/key-results/:kr_id/"""
    permission_classes = [permissions.IsAuthenticated]

    def _get_kr(self, workspace_slug, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(KeyResult.objects.prefetch_related("tasks"), id=kr_id, objective=obj)

    def get(self, request, workspace_slug, obj_id, kr_id):
        kr = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
        return Response(KeyResultSerializer(kr).data)

    def patch(self, request, workspace_slug, obj_id, kr_id):
        kr = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
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

    def delete(self, request, workspace_slug, obj_id, kr_id):
        kr = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
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

    def _get_kr(self, workspace_slug, obj_id, kr_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        obj = get_object_or_404(Objective, id=obj_id, workspace=workspace)
        return get_object_or_404(KeyResult.objects.prefetch_related("tasks__status"), id=kr_id, objective=obj)

    def get(self, request, workspace_slug, obj_id, kr_id):
        kr = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
        return Response(KeyResultLinkedTaskSerializer(kr.tasks.all(), many=True).data)

    def put(self, request, workspace_slug, obj_id, kr_id):
        kr = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
        kr.tasks.set(request.data.get("task_ids", []))
        return Response(KeyResultSerializer(kr).data)

    def post(self, request, workspace_slug, obj_id, kr_id):
        kr      = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.add(task_id)
        return Response(KeyResultSerializer(kr).data)

    def delete(self, request, workspace_slug, obj_id, kr_id):
        kr      = self._get_kr(workspace_slug, obj_id, kr_id, request.user)
        task_id = request.data.get("task_id")
        if task_id:
            kr.tasks.remove(task_id)
        return Response(KeyResultSerializer(kr).data)


# ── Import & Migration Tools (v4.6.0) ─────────────────────────────────────────

class ImportSourcesView(APIView):
    """GET /api/workspaces/:slug/import/sources/ — list available source formats."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        from .importers.registry import SUPPORTED_SOURCES
        return Response([
            {"id": k, "label": v["label"], "format": v["format"]}
            for k, v in SUPPORTED_SOURCES.items()
        ])


class ImportJobListCreateView(APIView):
    """
    GET  /api/workspaces/:slug/import/jobs/      — list recent import jobs
    POST /api/workspaces/:slug/import/jobs/      — upload file + source → parse + preview
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes     = [MultiPartParser, FormParser]

    def get(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        jobs = ImportJob.objects.filter(workspace=workspace).order_by("-created_at")[:20]
        return Response([{
            "id":             str(j.id),
            "source":         j.source,
            "status":         j.status,
            "file_name":      j.file_name,
            "total_count":    j.total_count,
            "imported_count": j.imported_count,
            "skipped_count":  j.skipped_count,
            "progress_pct":   j.progress_pct,
            "created_at":     j.created_at.isoformat(),
            "completed_at":   j.completed_at.isoformat() if j.completed_at else None,
            "can_rollback":   _can_rollback(j),
        } for j in jobs])

    def post(self, request, workspace_slug):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        source    = request.data.get("source", "").strip()
        file_obj  = request.FILES.get("file")

        if not source:
            return Response({"error": "source required"}, status=400)
        if not file_obj:
            return Response({"error": "file required"}, status=400)
        if file_obj.size > 50 * 1024 * 1024:
            return Response({"error": "File exceeds 50 MB limit"}, status=400)

        from .importers.registry import get_parser, SUPPORTED_SOURCES
        if source not in SUPPORTED_SOURCES:
            return Response({"error": f"Unknown source: {source}"}, status=400)

        parser = get_parser(source)
        content = file_obj.read().decode("utf-8", errors="replace")

        job = ImportJob.objects.create(
            workspace  = workspace,
            source     = source,
            status     = ImportJob.Status.PARSING,
            file_name  = file_obj.name,
            created_by = request.user,
        )

        try:
            fmt = SUPPORTED_SOURCES[source]["format"]
            if fmt == "xml":
                tasks = parser.parse(content)
                mapping = parser.detect_mapping(content)
                parsed_rows = [t.to_dict() for t in tasks]
                headers = list(mapping.keys())
            elif fmt == "json":
                tasks = parser.parse(content)
                mapping = parser.detect_mapping(content)
                parsed_rows = [t.to_dict() for t in tasks]
                headers = list(mapping.keys())
            else:  # csv
                tasks, headers, mapping = parser.parse(content, field_mapping=None)
                # Convert {col: {jcn_field, confidence}} → {col: jcn_field} for default
                flat_mapping = {col: info["jcn_field"] for col, info in mapping.items()}
                tasks2, _, _ = parser.parse(content, field_mapping=flat_mapping)
                parsed_rows = [t.to_dict() for t in tasks2]
                # Keep full mapping with confidence for the frontend
                mapping = mapping  # already the full dict

            preview = parsed_rows[:10]
            job.parsed_rows   = parsed_rows
            job.preview_rows  = preview
            job.field_mapping = mapping if fmt == "csv" else mapping
            job.status        = ImportJob.Status.MAPPED
            job.total_count   = len(parsed_rows)
            job.save()

        except Exception as exc:
            job.status    = ImportJob.Status.FAILED
            job.error_log = [{"error": str(exc)}]
            job.save(update_fields=["status", "error_log"])
            return Response({"error": str(exc)}, status=400)

        return Response({
            "job_id":       str(job.id),
            "source":       job.source,
            "status":       job.status,
            "total":        job.total_count,
            "preview":      job.preview_rows,
            "field_mapping": job.field_mapping,
            "headers":      headers,
        }, status=201)


class ImportJobDetailView(APIView):
    """
    GET   — current job status + progress
    PATCH — update field_mapping before running
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_job(self, workspace_slug, job_id, user):
        workspace = get_workspace_for_user(workspace_slug, user)
        return get_object_or_404(ImportJob, id=job_id, workspace=workspace)

    def get(self, request, workspace_slug, job_id):
        job = self._get_job(workspace_slug, job_id, request.user)
        return Response({
            "id":             str(job.id),
            "source":         job.source,
            "status":         job.status,
            "file_name":      job.file_name,
            "total_count":    job.total_count,
            "imported_count": job.imported_count,
            "skipped_count":  job.skipped_count,
            "progress_pct":   job.progress_pct,
            "preview_rows":   job.preview_rows,
            "field_mapping":  job.field_mapping,
            "error_log":      job.error_log[:20],
            "created_at":     job.created_at.isoformat(),
            "completed_at":   job.completed_at.isoformat() if job.completed_at else None,
            "can_rollback":   _can_rollback(job),
        })

    def patch(self, request, workspace_slug, job_id):
        job    = self._get_job(workspace_slug, job_id, request.user)
        mapping = request.data.get("field_mapping")
        if mapping is not None:
            job.field_mapping = mapping
            job.save(update_fields=["field_mapping"])
        return Response({"ok": True})


class ImportJobRunView(APIView):
    """POST /api/workspaces/:slug/import/jobs/:id/run/ — kick off the Celery import task."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, job_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        job       = get_object_or_404(ImportJob, id=job_id, workspace=workspace)

        if job.status not in (ImportJob.Status.MAPPED, ImportJob.Status.FAILED):
            return Response({"error": f"Job is in state {job.status}, cannot run."}, status=400)

        from .tasks import run_import
        run_import.delay(str(job.id))
        return Response({"ok": True, "job_id": str(job.id)})


class ImportJobRollbackView(APIView):
    """DELETE /api/workspaces/:slug/import/jobs/:id/rollback/ — undo the import."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, job_id):
        workspace = get_workspace_for_user(workspace_slug, request.user)
        job       = get_object_or_404(ImportJob, id=job_id, workspace=workspace)

        if not _can_rollback(job):
            return Response({"error": "Rollback window (24h) has expired or job is not complete."}, status=400)

        task_ids = job.imported_task_ids or []
        deleted  = Task.objects.filter(id__in=task_ids).delete()[0]
        job.status            = ImportJob.Status.FAILED   # mark as rolled back
        job.imported_task_ids = []
        job.save(update_fields=["status", "imported_task_ids"])
        return Response({"deleted": deleted})


def _can_rollback(job):
    if job.status != ImportJob.Status.COMPLETE:
        return False
    if not job.completed_at:
        return False
    from django.utils import timezone
    return (timezone.now() - job.completed_at).total_seconds() < 86400

