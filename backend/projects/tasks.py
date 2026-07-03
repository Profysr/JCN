"""Celery tasks for the projects app.

All inbox/WS delivery goes through core.events.push_inbox_items — this module
only decides WHO gets notified; the payload/DB/WS mechanics live in core/events.py.
"""

import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def send_comment_notifications(
    self, comment_id, workspace_id, sender_id, notified_ids, mentioned_user_ids=None
):
    """
    Send inbox notifications for a new comment/reply.

    Runs off the request path so POST /comments/ returns immediately.

    mentioned_user_ids: list of UUIDs resolved by the frontend @mention picker.
        The frontend resolves display names → user IDs at selection time, so we
        never do regex matching or full-table scans here.
    """
    try:
        # Local imports avoid circular imports at module load time.
        from accounts.models import User
        from core.events import push_inbox_items
        from workspaces.models import Workspace

        from .models import TaskComment

        comment = TaskComment.objects.select_related(
            "task", "task__board", "parent__author"
        ).get(id=comment_id)
        workspace = Workspace.objects.get(id=workspace_id)
        sender = User.objects.get(id=sender_id)
        task = comment.task

        # ── Collect (user_id, verb) pairs ─────────────────────────────────────
        recipients = []  # [(user_id_str, verb), ...]
        seen_ids = set()  # prevent duplicate notifications

        def _add(user_id_str, verb):
            if user_id_str not in seen_ids and user_id_str != sender_id:
                recipients.append((user_id_str, verb))
                seen_ids.add(user_id_str)

        for uid in notified_ids:
            _add(str(uid), "task_commented")

        # Parent comment author gets notified on replies.
        if comment.parent_id and str(comment.parent.author_id) != sender_id:
            _add(str(comment.parent.author_id), "task_commented")

        # @mentions — IDs already resolved by the frontend picker.
        # Validate membership to prevent notifying users from other workspaces.
        if mentioned_user_ids:
            valid_ids = set(
                User.objects.filter(
                    id__in=mentioned_user_ids,
                    workspace_memberships__workspace=workspace,
                ).values_list("id", flat=True)
            )
            for uid in valid_ids:
                _add(str(uid), "task_mentioned")

        if not recipients:
            return

        meta = {
            "task_id": str(task.id),
            "task_title": task.title,
            "board_id": str(task.board_id),
            "workspace_id": str(workspace.id),
            "comment_id": str(comment.id),
        }

        # One INSERT for all rows + per-recipient WS push, handled centrally.
        push_inbox_items([
            {
                "user_id": user_id,
                "workspace": workspace,
                "actor_id": str(sender.id),
                "actor_name": sender.full_name or sender.email,
                "verb": verb,
                "resource_name": task.title,
                "board_id": str(task.board_id),
                "board_name": task.board.name if task.board_id else "",
                "meta": meta,
            }
            for user_id, verb in recipients
        ])

    except Exception as exc:
        logger.exception(
            "send_comment_notifications failed (comment=%s, attempt=%s): %s",
            comment_id, self.request.retries, exc,
        )
        raise self.retry(exc=exc)
