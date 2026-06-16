from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db import models as django_models
from django.utils import timezone
from ..models import Board, Task
from ..serializers import TaskSearchSerializer, BoardSearchSerializer
from workspaces.models import WorkspaceMember
from .helpers import get_workspace_for_user


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
