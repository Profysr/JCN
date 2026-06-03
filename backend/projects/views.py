from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.db import models as django_models
from django.http import HttpResponse
from django.db.models import Count
from django.db.models.functions import TruncDate
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


def log_activity(task, actor, verb, meta=None):
    TaskActivity.objects.create(task=task, actor=actor, verb=verb, meta=meta or {})


def broadcast_to_user(user_id, event_type, data):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"user_{user_id}",
        {"type": "user.notification", "data": {"type": event_type, "payload": data}},
    )


def notify(recipient, actor, verb, workspace, task):
    """Create a Notification and push it to the recipient's WS group. No-op if actor == recipient."""
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
    broadcast_to_user(str(recipient.id), "notification.created", {
        "id": str(notif.id),
        "actor": {"id": str(actor.id), "full_name": actor.full_name, "email": actor.email},
        "verb": notif.verb,
        "meta": notif.meta,
        "read": False,
        "created_at": notif.created_at.isoformat(),
    })


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
        old_status = task.status
        old_priority = task.priority
        old_assignee = task.assignee

        serializer = TaskSerializer(task, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
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
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"tasks": [], "projects": []})

        workspace_ids = WorkspaceMember.objects.filter(
            user=request.user
        ).values_list("workspace_id", flat=True)

        # v3.2.0 — search across title AND description
        tasks = (
            Task.objects.filter(
                project__workspace_id__in=workspace_ids,
            ).filter(
                django_models.Q(title__icontains=q) | django_models.Q(description__icontains=q)
            )
            .select_related("project__workspace", "status")[:8]
        )
        projects = (
            Project.objects.filter(
                workspace_id__in=workspace_ids,
                name__icontains=q,
            )
            .select_related("workspace")[:5]
        )

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
        return Response(TaskSerializer(sorted_tasks, many=True, context={"request": request}).data)


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


