from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.db.models import Q
from django.utils import timezone
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
    CommentReaction,
    Approval,
    ApprovalReviewer,
)
from ..serializers import (
    TaskStatusSerializer,
    BulkStatusUpdateSerializer,
    TaskSerializer,
    TaskDetailSerializer,
    SubTaskSerializer,
    TaskCommentSerializer,
    TaskActivitySerializer,
    LabelSerializer,
    BoardFieldSerializer,
    TaskFieldValueSerializer,
    SavedViewSerializer,
    SprintSerializer,
    TaskAttachmentSerializer,
    MinimalTaskSerializer,
    TaskDependencySerializer,
    TaskTemplateSerializer,
    CommentReactionSerializer,
    ApprovalSerializer,
    ApprovalReviewerSerializer,
)
from workspaces.models import Notification
from .helpers import (
    _parse_pk,
    get_workspace_for_user,
    _get_board,
    _get_task,
    _get_subtask,
    _task_list_qs,
    _task_detail_qs,
    _log_task_patch_changes,
    _require_board_perm,
    broadcast,
    log_activity,
    notify,
)


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


class TaskStatusBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def put(self, request, workspace_id, project_id):
        from django.db import transaction

        board = _get_board(workspace_id, project_id, request.user)

        # Wrap the raw list in the key the serializer expects
        serializer = BulkStatusUpdateSerializer(data={"statuses": request.data})
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data["statuses"]

        with transaction.atomic():
            existing = {str(s.id): s for s in board.statuses.prefetch_related("tasks")}
            incoming_ids = {str(item["id"]) for item in items if item.get("id")}

            # Guard: cannot delete a column that still has tasks
            for sid, s in existing.items():
                if sid not in incoming_ids and s.tasks.exists():
                    return Response(
                        {"error": f'Cannot delete "{s.name}" — move its tasks out first.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Delete statuses removed from the list
            board.statuses.exclude(id__in=incoming_ids).delete()

            # Update existing / create new, using list position as the saved order
            to_bulk_update = []
            for i, item in enumerate(items):
                sid = str(item.get("id", ""))
                if sid in existing:
                    s = existing[sid]
                    s.name    = item["name"]
                    s.color   = item["color"]
                    s.is_done = item["is_done"]
                    s.order   = i
                    to_bulk_update.append(s)
                else:
                    TaskStatus.objects.create(
                        board=board,
                        name=item["name"],
                        color=item["color"],
                        is_done=item["is_done"],
                        order=i,
                    )

            TaskStatus.objects.bulk_update(to_bulk_update, ["name", "color", "is_done", "order"])

        return Response(TaskStatusSerializer(board.statuses.all(), many=True).data)

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


# ── Labels ✅───────────────────────────────────────────────────────────────────
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


# ── v2.4.0 — Advanced Task System ────────────────────────────────────────────
class TaskCloneView(APIView):
    """POST /tasks/:id/clone/ — deep-clone a task and return the new task."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, project_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        _require_board_perm(request.user, board, "edit")
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
        _require_board_perm(request.user, board, "edit")
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
        _require_board_perm(request.user, board, "edit")
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
        _require_board_perm(request.user, board, "edit")
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
            from ..automation import fire_automation

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
