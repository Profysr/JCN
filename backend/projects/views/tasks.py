from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from core.pagination import ActivityPagination
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.db import transaction
from django.db.models import Count, Q, Case, When, Value, IntegerField
from django.utils import timezone
import csv
from ..models import (
    Board,
    TaskStatus,
    Task,
    SubTask,
    TaskActivity,
    Label,
    BoardField,
    TaskFieldValue,
    SavedView,
    Sprint,
    TaskAttachment,
    TaskDependency,
    TaskTemplate,
    Approval,
)
from ..serializers import (
    TaskStatusSerializer,
    BulkStatusUpdateSerializer,
    TaskBulkActionSerializer,
    TaskSerializer,
    TaskCardSerializer,
    TaskDetailSerializer,
    SubTaskSerializer,
    TaskActivitySerializer,
    LabelSerializer,
    BoardFieldSerializer,
    TaskFieldValueSerializer,
    SavedViewSerializer,
    SprintSerializer,
    SprintListSerializer,
    TaskAttachmentSerializer,
    MinimalTaskSerializer,
    TaskDependencySerializer,
    TaskTemplateSerializer,
    ApprovalSerializer,
    ApprovalReviewerSerializer,
    ApprovalReviewSerializer,
    ApprovalResubmitSerializer,
    ApprovalAdminOverrideSerializer,
    MyWorkTaskSerializer,
    ChildTaskSerializer,
)
from workspaces.models import InboxItem, WorkspaceMember
from .helpers import (
    get_workspace_for_user,
    _get_board,
    _get_task,
    _get_subtask,
    _task_list_qs,
    _task_detail_qs,
    _apply_task_filters,
    _log_task_patch_changes,
    _require_board_perm,
    broadcast,
    log_activity,
    notify,
    _is_workspace_admin,
)


# ── Task Statuses (Kanban columns) ✅───────────────────────────────────────────
class TaskStatusListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        return Response(TaskStatusSerializer(board.statuses.all(), many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = TaskStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # 1. Sort columns from highest order to lowest (e.g., 3, 2, 1)
        # 2. Grab only the 'order' numbers as a flat list: [3, 2, 1]
        # 3. Take the first item (the highest number): 3
        # 4. Fallback: If the board has 0 columns, start at 0
        # 5. Add 1 to get the next position: 4
        next_order = (
            board.statuses.order_by("-order").values_list("order", flat=True).first()
            or 0
        ) + 1
        serializer.save(board=board, order=next_order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


def _guard_deletions(existing, incoming_ids):
    """Return an error string if any status being removed still has tasks, else None."""
    for sid, s in existing.items():
        if sid not in incoming_ids and s.tasks.exists():
            return f'Cannot delete "{s.name}" — move its tasks out first.'
    return None


def _apply_status_items(board, existing, items):
    """Mutate existing statuses and collect new ones; returns objects ready for bulk_update."""
    to_update, to_create = [], []
    for i, item in enumerate(items):
        sid = str(item.get("id", ""))
        if sid in existing:
            s = existing[sid]
            # Only queue for bulk_update if at least one field actually changed — avoids unnecessary writes for statuses the user didn't touch.
            changed = (
                s.name != item["name"]
                or s.color != item["color"]
                or s.is_done != item["is_done"]
                or s.is_started != item["is_started"]
                or s.order != i
            )
            if changed:
                s.name = item["name"]
                s.color = item["color"]
                s.is_done = item["is_done"]
                s.is_started = item["is_started"]
                s.order = i
                to_update.append(s)
        else:
            to_create.append(
                TaskStatus(
                    board=board,
                    name=item["name"],
                    color=item["color"],
                    is_done=item["is_done"],
                    is_started=item["is_started"],
                    order=i,
                )
            )
    if to_create:
        TaskStatus.objects.bulk_create(to_create)
    return to_update


class TaskStatusBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = BulkStatusUpdateSerializer(data={"statuses": request.data})
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data["statuses"]

        with transaction.atomic():
            existing = {str(s.id): s for s in board.statuses.prefetch_related("tasks")}
            incoming_ids = {str(item["id"]) for item in items if item.get("id")}

            error = _guard_deletions(existing, incoming_ids)
            if error:
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

            board.statuses.exclude(id__in=incoming_ids).delete()
            to_update = _apply_status_items(board, existing, items)
            TaskStatus.objects.bulk_update(
                to_update, ["name", "color", "is_done", "is_started", "order"]
            )

        statuses_data = TaskStatusSerializer(board.statuses.order_by("order").all(), many=True).data
        # broadcast(workspace_id, "status.updated", {"board_id": str(board.id), "statuses": statuses_data})
        return Response(statuses_data)


# ── Task helpers ──────────────────────────────────────────────────────────────
def _check_version_conflict(task, incoming_version):
    """Return a 409 Response if the client's version is stale, else None."""
    if incoming_version is not None and int(incoming_version) != task.version:
        return Response(
            {
                "conflict": True,
                "current_version": task.version,
                "updated_at": task.updated_at.isoformat(),
            },
            status=status.HTTP_409_CONFLICT,
        )
    return None


def _broadcast_task_card(workspace_id, task_pk, event="task.updated"):
    """Re-fetch task with card annotations, broadcast to kanban clients, return the task."""
    card_task = _task_list_qs().get(pk=task_pk)
    broadcast(workspace_id, event, TaskCardSerializer(card_task).data)
    return card_task


# ── Tasks ✅────────────────────────────────────────────────────────────────────
class TaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        tasks = _task_list_qs().filter(board=board).order_by("status_id", "order")
        tasks = _apply_task_filters(tasks, request.query_params, user=request.user)
        return Response(TaskCardSerializer(tasks, many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = TaskSerializer(data=request.data, context={"request": request, "board": board})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(board=board)

        # Logging who created task, and whom assigned to
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        if task.assignee and task.assignee != request.user:
            notify(
                task.assignee,
                request.user,
                InboxItem.Verb.TASK_ASSIGNED,
                board.workspace,
                task,
            )

        task = _task_list_qs().get(pk=task.pk)
        data = TaskCardSerializer(task).data
        broadcast(workspace_id, "task.created", data)
        return Response(data, status=status.HTTP_201_CREATED)


class TaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, task_id):
        task = _get_task(
            workspace_id, board_id, task_id, request.user, qs=_task_detail_qs()
        )
        return Response(TaskDetailSerializer(task, context={"request": request}).data)

    def patch(self, request, workspace_id, board_id, task_id):
        task = _get_task(
            workspace_id, board_id, task_id, request.user, qs=_task_list_qs()
        )

        conflict = _check_version_conflict(task, request.data.get("version"))
        if conflict:
            return conflict

        old_status, old_priority, old_assignee = task.status, task.priority, task.assignee

        serializer = TaskSerializer(
            task, data=request.data, partial=True, context={"request": request, "board": task.board}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        Task.objects.filter(pk=task.pk).update(version=task.version + 1)

        # Broadcast card-level data to kanban clients; log after so activity
        # is recorded against the already-saved state.
        card_task = _broadcast_task_card(workspace_id, task.pk)
        _log_task_patch_changes(card_task, request.user, request.data, old_status, old_priority, old_assignee)

        # Return full detail data so TaskDetailPanel gets a fresh snapshot
        # (subtasks, comments, activities, field_values, etc.)
        detail_task = _task_detail_qs().get(pk=task.pk)
        return Response(TaskDetailSerializer(detail_task, context={"request": request}).data)

    def delete(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        _require_board_perm(request.user, task.board, "delete")
        task_id_str = str(task.id)
        task.delete()
        broadcast(
            workspace_id,
            "task.deleted",
            {"id": task_id_str, "board_id": str(board_id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Move (Kanban drag & drop) ✅───────────────────────────────────────────
def _check_move_blocked(task, task_status):
    """Return a 403 Response if the move should be blocked, else None."""
    if task_status.is_done and task.approvals.filter(status=Approval.Status.PENDING).exists():
        return Response(
            {
                "approval_required": True,
                "detail": "This task has pending approvals. Resolve them before marking it done.",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class TaskMoveView(APIView):
    """PATCH: atomically update a task's status column and sort order."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, board_id, task_id):
        board = _get_board(workspace_id, board_id, request.user)
        task = get_object_or_404(Task, id=task_id, board=board)
        # Snapshot the current status so we can detect a column change below.
        old_status = task.status

        status_id = request.data.get("status_id")
        order = request.data.get("order")

        if status_id is not None:
            task_status = get_object_or_404(TaskStatus, id=status_id, board=board)
            # Reject the move if the task has pending approvals and the destination is a done column (_check_move_blocked returns a 400 Response in that case, None otherwise).
            blocked = _check_move_blocked(task, task_status)
            if blocked:
                return blocked
            task.status = task_status

        if order is not None:
            task.order = order

        update_fields = ["status", "order", "updated_at"]

        # if a task is moved to is_started column and it hasn't any start date define at the moment, give it todays date
        if status_id is not None and task_status.is_started and task.start_date is None:
            from django.utils import timezone
            task.start_date = timezone.now().date()
            update_fields.append("start_date")

        task.save(update_fields=update_fields)

        # Only write an activity row when the column actually changed.
        if task.status != old_status:
            log_activity(
                task,
                request.user,
                TaskActivity.Verb.STATUS,
                {"from": old_status.name if old_status else None, "to": task.status.name},
            )

        # Both broadcast and response use card shape — move only affects the kanban board.
        card_task = _broadcast_task_card(workspace_id, task.pk, event="task.moved")
        return Response(TaskCardSerializer(card_task).data)


# ── Bulk Actions (v1.1.0) ─────────────────────────────────────────────────────
def _bulk_delete(tasks, workspace_id, board_id):
    """Delete the task queryset and broadcast the tombstone list to kanban clients."""
    task_ids = list(tasks.values_list("id", flat=True))
    count, _ = tasks.delete()
    broadcast(
        workspace_id,
        "tasks.bulk_deleted",
        {"task_ids": [str(i) for i in task_ids], "board_id": str(board_id)},
    )
    return Response({"deleted": count})


def _bulk_update(tasks, updates, workspace_id, board_id):
    """Apply field overrides to the task queryset and broadcast updated cards."""
    update_kwargs = {}
    if updates.get("status_id"):
        update_kwargs["status_id"] = updates["status_id"]
    if updates.get("priority"):
        update_kwargs["priority"] = updates["priority"]
    if "assignee_id" in updates:
        update_kwargs["assignee_id"] = updates["assignee_id"]

    # Exclude rows that already carry the exact same values — avoids unnecessary writes (e.g. unassigning 5 tasks when only 1 was assigned).
    if update_kwargs:
        exclude_filter = Q(**update_kwargs)
        tasks.exclude(exclude_filter).update(**update_kwargs)

    # Re-fetch with full card annotations so the broadcast payload matches
    # what individual task endpoints send — subtask counts, approval counts, labels, etc.
    task_ids = list(tasks.values_list("id", flat=True))
    updated_tasks = _task_list_qs().filter(id__in=task_ids)
    updated = TaskCardSerializer(updated_tasks, many=True).data
    broadcast(
        workspace_id,
        "tasks.bulk_updated",
        {"tasks": updated, "board_id": str(board_id)},
    )
    return Response({"updated": len(updated), "tasks": updated})


class TaskBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id):
        serializer = TaskBulkActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        board = _get_board(workspace_id, board_id, request.user)
        tasks = Task.objects.filter(id__in=data["task_ids"], board=board)

        if data["action"] == "delete":
            _require_board_perm(request.user, board, "delete")
            return _bulk_delete(tasks, workspace_id, board_id)

        if data["action"] == "update":
            return _bulk_update(tasks, data["updates"], workspace_id, board_id)


# ── Subtasks ✅──────────────────────────────────────────────────────────────────
class SubTaskListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        return Response(SubTaskSerializer(task.subtasks.all(), many=True).data)

    def post(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        serializer = SubTaskSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        subtask = serializer.save(task=task)
        log_activity(
            task, request.user, TaskActivity.Verb.SUBTASK, {"title": subtask.title}
        )
        return Response(SubTaskSerializer(subtask).data, status=status.HTTP_201_CREATED)


class SubTaskDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, board_id, task_id, subtask_id):
        subtask = _get_subtask(
            workspace_id, board_id, task_id, subtask_id, request.user
        )
        serializer = SubTaskSerializer(subtask, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, task_id, subtask_id):
        subtask = _get_subtask(
            workspace_id, board_id, task_id, subtask_id, request.user
        )
        subtask.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Activity ✅──────────────────────────────────────────────────────────────────
class TaskActivityListView(ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TaskActivitySerializer
    pagination_class = ActivityPagination

    def get_queryset(self):
        task = _get_task(
            self.kwargs["workspace_id"],
            self.kwargs["board_id"],
            self.kwargs["task_id"],
            self.request.user,
        )
        return task.activities.select_related("actor").order_by("-id")

# ── Labels ✅──────────────────────────────────────────────────────────────────
class LabelListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        return Response(LabelSerializer(board.labels.all(), many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = LabelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        label = serializer.save(board=board)
        return Response(LabelSerializer(label).data, status=status.HTTP_201_CREATED)


class LabelDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_label(self, workspace_id, board_id, label_id, user):
        board = _get_board(workspace_id, board_id, user)
        return get_object_or_404(Label, id=label_id, board=board)

    def patch(self, request, workspace_id, board_id, label_id):
        label = self.get_label(workspace_id, board_id, label_id, request.user)
        serializer = LabelSerializer(label, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, label_id):
        label = self.get_label(workspace_id, board_id, label_id, request.user)
        label.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Custom Fields (v0.8.0) ‼️────────────────────────────────────────────────────
class BoardFieldListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        return Response(BoardFieldSerializer(board.fields.all(), many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = BoardFieldSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field = serializer.save(board=board, order=board.fields.count())
        return Response(
            BoardFieldSerializer(field).data, status=status.HTTP_201_CREATED
        )


class BoardFieldDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_field(self, workspace_id, board_id, field_id, user):
        board = _get_board(workspace_id, board_id, user)
        return get_object_or_404(BoardField, id=field_id, board=board)

    def patch(self, request, workspace_id, board_id, field_id):
        field = self.get_field(workspace_id, board_id, field_id, request.user)
        serializer = BoardFieldSerializer(field, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, field_id):
        field = self.get_field(workspace_id, board_id, field_id, request.user)
        field.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskFieldValueView(APIView):
    """Upsert a single custom field value for a task."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        serializer = TaskFieldValueSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        field_value = serializer.save(task=task)
        return Response(TaskFieldValueSerializer(field_value).data)


# ── Saved Views (v0.8.0) ✅─────────────────────────────────────────────────────
class SavedViewListCreateView(APIView):
    """Helps to store the filter views so that user can choose from existing filtered views"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        views = board.saved_views.filter(user=request.user)
        return Response(SavedViewSerializer(views, many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = SavedViewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        view = serializer.save(board=board, user=request.user)
        return Response(SavedViewSerializer(view).data, status=status.HTTP_201_CREATED)


class SavedViewDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_view(self, workspace_id, board_id, view_id, user):
        board = _get_board(workspace_id, board_id, user)
        return get_object_or_404(SavedView, id=view_id, board=board, user=user)

    def delete(self, request, workspace_id, board_id, view_id):
        view = self.get_view(workspace_id, board_id, view_id, request.user)
        view.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Sprints (v0.9.0) ✅ ─────────────────────────────────────────────────────────
def _sprint_qs(board=None):
    """Annotated sprint queryset. Pass board to scope to that board."""
    qs = Sprint.objects.select_related("board").annotate(
        task_count=Count("tasks"),
        completed_count=Count("tasks", filter=Q(tasks__status__is_done=True)),
    )
    if board is not None:
        qs = qs.filter(board=board)
    return qs


def _get_sprint(workspace_id, board_id, sprint_id, user):
    """Return an annotated Sprint scoped to the board, or 404."""
    board = _get_board(workspace_id, board_id, user)
    return get_object_or_404(_sprint_qs(board), id=sprint_id)


class SprintListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        return Response(SprintListSerializer(_sprint_qs(board), many=True).data)

    def post(self, request, workspace_id, board_id):
        board = _get_board(workspace_id, board_id, request.user)
        serializer = SprintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sprint = serializer.save(board=board)
        return Response(SprintSerializer(_sprint_qs(board).get(pk=sprint.pk)).data, status=status.HTTP_201_CREATED)


class SprintDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, sprint_id):
        sprint = _get_sprint(workspace_id, board_id, sprint_id, request.user)
        return Response(SprintSerializer(sprint).data)

    def patch(self, request, workspace_id, board_id, sprint_id):
        sprint = _get_sprint(workspace_id, board_id, sprint_id, request.user)
        serializer = SprintSerializer(sprint, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Re-fetch with annotations so response counts reflect the saved state.
        board = _get_board(workspace_id, board_id, request.user)
        return Response(SprintSerializer(_sprint_qs(board).get(pk=sprint.pk)).data)

    def delete(self, request, workspace_id, board_id, sprint_id):
        sprint = _get_sprint(workspace_id, board_id, sprint_id, request.user)
        sprint.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SprintBulkTaskView(APIView):
    """POST /sprints/{id}/tasks/bulk/ — assign or remove many tasks in one DB write."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, sprint_id):
        sprint = _get_sprint(workspace_id, board_id, sprint_id, request.user)

        task_ids = request.data.get("task_ids", [])
        action = request.data.get("action", "add")

        if not isinstance(task_ids, list) or not task_ids:
            return Response(
                {"error": "task_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if action not in ("add", "remove"):
            return Response(
                {"error": "action must be 'add' or 'remove'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        tasks = Task.objects.filter(id__in=task_ids, board=sprint.board)
        tasks.update(sprint=sprint if action == "add" else None)

        updated = TaskCardSerializer(_task_list_qs().filter(id__in=task_ids), many=True).data
        broadcast(
            workspace_id,
            "tasks.bulk_updated",
            {"tasks": updated, "board_id": str(board_id)},
        )
        return Response({"updated": len(updated)})


# ── File Attachments (v1.2.0) ─────────────────────────────────────────────────
class TaskAttachmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def _get_task(self, workspace_id, board_id, task_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, board=board)

    def get(self, request, workspace_id, board_id, task_id):
        task = self._get_task(workspace_id, board_id, task_id, request.user)
        return Response(
            TaskAttachmentSerializer(
                task.attachments.select_related("uploaded_by").all(),
                many=True,
                context={"request": request},
            ).data
        )

    def post(self, request, workspace_id, board_id, task_id):
        task = self._get_task(workspace_id, board_id, task_id, request.user)
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

    def delete(self, request, workspace_id, board_id, task_id, attachment_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, board=board)
        attachment = get_object_or_404(TaskAttachment, id=attachment_id, task=task)
        attachment.file.delete(save=False)
        attachment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Task Dependencies (v1.4.0) ────────────────────────────────────────────────
class TaskDependencyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_task(self, workspace_id, board_id, task_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        return get_object_or_404(Task, id=task_id, board=board), board

    def get(self, request, workspace_id, board_id, task_id):
        task, _ = self._get_task(workspace_id, board_id, task_id, request.user)
        blocked_by = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocker).data}
            for d in task.blocked_by_deps.select_related("blocker__status").all()
        ]
        blocking = [
            {"id": str(d.id), "task": MinimalTaskSerializer(d.blocked).data}
            for d in task.blocking_deps.select_related("blocked__status").all()
        ]
        return Response({"blocked_by": blocked_by, "blocking": blocking})

    def post(self, request, workspace_id, board_id, task_id):
        task, board = self._get_task(workspace_id, board_id, task_id, request.user)
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

    def delete(self, request, workspace_id, board_id, task_id, dep_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, board=board)
        dep = get_object_or_404(TaskDependency, id=dep_id)
        if dep.blocker.board_id != board.id and dep.blocked.board_id != board.id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        dep.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class TaskChildrenView(APIView):
    """GET /tasks/:id/children/ — list direct child tasks."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, board=board)
        children = task.children.select_related("status").all()
        return Response(ChildTaskSerializer(children, many=True).data)

    def post(self, request, workspace_id, board_id, task_id):
        """Create a child task under this parent."""
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        parent = get_object_or_404(Task, id=task_id, board=board)
        data = request.data.copy()
        data["parent_id"] = str(parent.id)
        serializer = TaskSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        task = serializer.save(board=board, created_by=request.user, parent=parent)
        log_activity(task, request.user, TaskActivity.Verb.CREATED)
        broadcast(workspace_id, "task.created", serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

# ── CSV Export (v1.7.0) ‼️───────────────────────────────────────────────────────
class TaskExportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
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

# ── v2.4.0 — Advanced Task System ────────────────────────────────────────────
class TaskCloneView(APIView):
    """POST /tasks/:id/clone/ — deep-clone a task and return the new task."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        task = get_object_or_404(Task, id=task_id, board=board)
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

# / ── Task Templates ‼️────────────────────────────────────────────
class TaskTemplateListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        templates = board.task_templates.all()
        return Response(TaskTemplateSerializer(templates, many=True).data)

    def post(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        serializer = TaskTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(board=board, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskTemplateDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, board_id, template_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        serializer = TaskTemplateSerializer(template, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, template_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        _require_board_perm(request.user, board, "edit")
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TaskApplyTemplateView(APIView):
    """POST /tasks/:id/apply-template/ — apply a template to an existing task (fills subtasks)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        task = get_object_or_404(Task, id=task_id, board=board)
        template_id = request.data.get("template_id")
        template = get_object_or_404(TaskTemplate, id=template_id, board=board)
        for i, sub in enumerate(template.default_subtasks):
            SubTask.objects.get_or_create(
                task=task, title=sub.get("title", ""), defaults={"order": i}
            )
        return Response(TaskDetailSerializer(task, context={"request": request}).data)


# ── v3.6.0 — Approval Workflows ──────────────────────────────────────────────

def _get_approval(workspace_id, board_id, task_id, approval_id, user):
    """Return an Approval scoped to the task, with reviewers prefetched, or 404."""
    task = _get_task(workspace_id, board_id, task_id, user)
    return get_object_or_404(
        Approval.objects.prefetch_related("reviewers__user").select_related("requested_by"),
        id=approval_id,
        task=task,
    )


def _notify_reviewers(approval, actor, workspace, task):
    """Send an APPROVAL_REQUESTED inbox notification to every reviewer."""
    for reviewer in approval.reviewers.select_related("user"):
        notify(
            recipient=reviewer.user,
            actor=actor,
            verb=InboxItem.Verb.APPROVAL_REQUESTED,
            workspace=workspace,
            task=task,
        )


def _broadcast_approval(workspace_id, board_id, task_id, event, approval):
    """Broadcast an approval event with the standard task/board context."""
    broadcast(workspace_id, event, {
        "task_id": str(task_id),
        "board_id": str(board_id),
        "approval": ApprovalSerializer(approval).data,
    })


class ApprovalListCreateView(APIView):
    """
    GET  /tasks/:id/approvals/  — list all approvals for a task
    POST /tasks/:id/approvals/  — request a new approval
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        approvals = task.approvals.prefetch_related("reviewers__user").select_related("requested_by")
        return Response(ApprovalSerializer(approvals, many=True).data)

    def post(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        serializer = ApprovalSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        approval = serializer.save(task=task, requested_by=request.user)
        _notify_reviewers(approval, request.user, task.board.workspace, task)
        _broadcast_approval(workspace_id, board_id, task_id, "approval.created", approval)
        return Response(ApprovalSerializer(approval).data, status=status.HTTP_201_CREATED)


class ApprovalReviewView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/review/
    Body: { "status": "approved"|"rejected"|"changes_requested", "comment": "..." }
    Only the designated reviewer can submit their verdict.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id, approval_id):
        approval = _get_approval(workspace_id, board_id, task_id, approval_id, request.user)

        reviewer = approval.reviewers.filter(user=request.user).first()
        if not reviewer:
            return Response(
                {"detail": "You are not a reviewer on this approval."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ApprovalReviewSerializer(reviewer, data=request.data)
        serializer.is_valid(raise_exception=True)
        # old_overall = approval.status  # ‼️ only needed for automation triggers
        serializer.save()
        approval.recompute_status()

        _broadcast_approval(workspace_id, board_id, task_id, "approval.updated", approval)

        # ‼️ Automation disabled — uncomment when fire_automation is rebuilt.
        # if approval.status != old_overall:
        #     from ..automation import fire_automation
        #     trigger = {
        #         Approval.Status.APPROVED: "approval.approved",
        #         Approval.Status.REJECTED: "approval.rejected",
        #     }.get(approval.status)
        #     if trigger:
        #         fire_automation(trigger, approval.task, actor=request.user, context={"approval_id": str(approval_id)})

        return Response(ApprovalSerializer(approval).data)


class ApprovalResubmitView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/resubmit/
    Resets a changes_requested or rejected approval back to pending so reviewers
    can re-evaluate without the assignee creating a duplicate approval record.
    Only the original requester may resubmit.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id, approval_id):
        approval = _get_approval(workspace_id, board_id, task_id, approval_id, request.user)
        serializer = ApprovalResubmitSerializer(approval, data={}, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _notify_reviewers(approval, request.user, approval.task.board.workspace, approval.task)
        _broadcast_approval(workspace_id, board_id, task_id, "approval.updated", approval)
        return Response(ApprovalSerializer(approval).data)


class ApprovalAdminOverrideView(APIView):
    """
    POST /tasks/:id/approvals/:approval_id/admin-override/
    Body: { "status": "approved"|"rejected"|"changes_requested", "comment": "..." }
    Only workspace admins (owner or board.admin permission) may call this.
    The action is logged to TaskActivity so it appears in the Activity tab.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id, approval_id):
        approval = _get_approval(workspace_id, board_id, task_id, approval_id, request.user)

        if not _is_workspace_admin(approval.task.board.workspace, request.user):
            return Response(
                {"detail": "Only workspace admins can override approvals."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = ApprovalAdminOverrideSerializer(
            approval, data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        log_activity(
            approval.task,
            request.user,
            "approval_admin_overridden",
            {
                "approval_id": str(approval.id),
                "new_status": approval.status,
                "comment": approval.override_comment,
            },
        )

        _broadcast_approval(workspace_id, board_id, task_id, "approval.updated", approval)
        return Response(ApprovalSerializer(approval).data)


# ── v3.4.0 — My Work ✅─────────────────────────────────────────────────────────
class MyWorkView(APIView):
    """GET /my-work/ — tasks assigned to the current user across all workspaces, sorted by urgency."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from datetime import timedelta

        workspace_ids = WorkspaceMember.objects.filter(user=request.user).values_list(
            "workspace_id", flat=True
        )

        today = timezone.now().date()
        week_end = today + timedelta(days=7)

        tasks = (
            _task_list_qs()
            .select_related("status", "board__workspace")
            .filter(board__workspace_id__in=workspace_ids, assignee=request.user)
            .exclude(status__is_done=True)
            .annotate(
                urgency=Case(
                    When(due_date__isnull=False, due_date__lt=today, then=Value(100)),
                    When(due_date=today, then=Value(30)),
                    When(due_date__isnull=False, due_date__lte=week_end, then=Value(10)),
                    default=Value(0),
                    output_field=IntegerField(),
                )
                + Case(
                    When(priority="urgent", then=Value(50)),
                    When(priority="high", then=Value(20)),
                    default=Value(0),
                    output_field=IntegerField(),
                )
            )
            .order_by("-urgency", "due_date")
        )

        return Response(
            MyWorkTaskSerializer(tasks, many=True, context={"request": request}).data
        )
