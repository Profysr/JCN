from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import CommentPagination

from ..cache import invalidate_reactions, set_reactions as cache_set
from ..models import CommentReaction, TaskActivity, TaskComment
from ..serializers import TaskCommentReplySerializer, TaskCommentSerializer
from ..tasks import send_comment_notifications
from .helpers import (
    _get_task,
    broadcast,
    get_workspace_for_user,
    log_activity,
)


def _comment_list_qs():
    """Top-level comments with replies and reactions prefetched — zero N+1."""
    reply_qs = TaskComment.objects.select_related("author").prefetch_related(
        Prefetch("reactions", queryset=CommentReaction.objects.select_related("user"))
    )
    return (
        TaskComment.objects.filter(parent__isnull=True)
        .select_related("author")
        .prefetch_related(
            Prefetch("reactions", queryset=CommentReaction.objects.select_related("user")),
            Prefetch("replies", queryset=reply_qs),
        )
        .order_by("-id")
    )


def _build_grouped_reactions(comment):
    """Build grouped reactions from DB and populate the cache."""
    grouped = {}
    for r in comment.reactions.select_related("user").all():
        grouped.setdefault(r.emoji, []).append(
            {"id": str(r.id), "user_id": str(r.user_id), "name": r.user.full_name or r.user.email}
        )
    cache_set(comment.id, grouped)
    return grouped


class TaskCommentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, task_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        qs = _comment_list_qs().filter(task=task)
        paginator = CommentPagination()
        page = paginator.paginate_queryset(qs, request)
        data = TaskCommentSerializer(page, many=True, context={"request": request}).data
        return paginator.get_paginated_response(data)

    def post(self, request, workspace_id, board_id, task_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        task = _get_task(workspace_id, board_id, task_id, request.user)

        parent_id = request.data.get("parent_id")
        if parent_id:
            get_object_or_404(TaskComment, id=parent_id, task=task, parent__isnull=True)

        # Frontend resolves @mentions to user IDs at selection time — no regex needed.
        mentioned_user_ids = list(request.data.get("mentioned_user_ids", []))

        if mentioned_user_ids and task.board.is_private:
            from ..permissions import user_can_be_board_participant
            from django.contrib.auth import get_user_model
            User = get_user_model()
            blocked = []
            for uid in mentioned_user_ids:
                try:
                    u = User.objects.get(id=uid)
                    if not user_can_be_board_participant(u, task.board):
                        blocked.append(u.full_name or u.email)
                except User.DoesNotExist:
                    pass
            if blocked:
                return Response(
                    {"detail": f"Cannot mention {', '.join(blocked)} — they don't have access to this board."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = TaskCommentSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(task=task)
        log_activity(task, request.user, TaskActivity.Verb.COMMENTED)

        # IDs of users who should get a TASK_COMMENTED notification.
        notified_ids = [
            str(u.id)
            for u in [task.assignee, task.created_by]
            if u and u != request.user
        ]

        # Hand off every notification to a background worker.
        # The view returns 201 immediately — users are never waiting for notify().
        send_comment_notifications.delay(
            str(comment.id), str(workspace.id), str(request.user.id),
            notified_ids, mentioned_user_ids,
        )

        is_reply = bool(comment.parent_id)
        SerializerClass = TaskCommentReplySerializer if is_reply else TaskCommentSerializer
        data = SerializerClass(comment, context={"request": request}).data

        broadcast(
            workspace_id,
            "comment.created",
            {"task_id": str(task.id), "board_id": str(task.board_id), "comment": data, "is_reply": is_reply},
        )
        return Response(data, status=status.HTTP_201_CREATED)


class TaskCommentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_comment(self, workspace_id, board_id, task_id, comment_id, user):
        task = _get_task(workspace_id, board_id, task_id, user)
        return get_object_or_404(TaskComment, id=comment_id, task=task)

    def patch(self, request, workspace_id, board_id, task_id, comment_id):
        comment = self._get_comment(workspace_id, board_id, task_id, comment_id, request.user)
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

    def delete(self, request, workspace_id, board_id, task_id, comment_id):
        comment = self._get_comment(workspace_id, board_id, task_id, comment_id, request.user)
        if comment.author != request.user:
            return Response(
                {"detail": "You can only delete your own comments."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment_id_str = str(comment.id)
        invalidate_reactions(comment.id)
        comment.delete()
        broadcast(
            workspace_id,
            "comment.deleted",
            {"task_id": str(task_id), "board_id": str(board_id), "comment_id": comment_id_str},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class CommentReactionToggleView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, board_id, task_id, comment_id):
        task = _get_task(workspace_id, board_id, task_id, request.user)
        comment = get_object_or_404(TaskComment, id=comment_id, task=task)

        emoji = request.data.get("emoji", "").strip()
        if not emoji:
            return Response({"detail": "emoji required."}, status=status.HTTP_400_BAD_REQUEST)

        # get_or_create is safe under concurrent requests — DB unique_together prevents
        # duplicate rows. delete() on the existing row handles the toggle-off case.
        reaction, created = CommentReaction.objects.get_or_create(
            comment=comment, user=request.user, emoji=emoji
        )
        if created:
            action = "added"
        else:
            reaction.delete()
            action = "removed"

        # Invalidate stale cache, rebuild from DB, push the fresh data to Redis.
        # All subsequent reads (list endpoint, reaction toggles) will hit Redis until TTL.
        invalidate_reactions(comment.id)
        grouped = _build_grouped_reactions(comment)

        broadcast(
            workspace_id,
            "reaction.updated",
            {
                "comment_id": str(comment.id),
                "task_id": str(task_id),
                "board_id": str(board_id),
                "reactions": grouped,
                "action": action,
                "emoji": emoji,
            },
        )
        return Response({"reactions": grouped, "action": action})
