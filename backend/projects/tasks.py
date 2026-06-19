"""Celery tasks for the projects app."""

from celery import shared_task


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

    All InboxItem rows are written in a single bulk_create (one DB round-trip),
    then each recipient's WebSocket channel is pushed individually — WS events
    are per-user so they can't be batched, but they're Redis pub/sub (fast).
    """
    try:
        # Local imports avoid circular imports at module load time.
        from core.fields import format_id
        from accounts.models import User
        from workspaces.models import InboxItem, Workspace

        from .models import TaskComment
        from .views.helpers import broadcast_to_user

        comment = (
            TaskComment.objects
            .select_related("task", "task__board", "parent__author")
            .get(id=comment_id)
        )
        workspace = Workspace.objects.get(id=workspace_id)
        sender = User.objects.get(id=sender_id)
        task = comment.task

        # ── Collect (user_id, verb) pairs ─────────────────────────────────────
        recipients = []   # [(user_id_str, verb), ...]
        seen_ids = set()  # prevent duplicate notifications

        def _add(user_id_str, verb):
            if user_id_str not in seen_ids and user_id_str != sender_id:
                recipients.append((user_id_str, verb))
                seen_ids.add(user_id_str)

        for uid in notified_ids:
            _add(str(uid), InboxItem.Verb.TASK_COMMENTED)

        # Parent comment author gets notified on replies.
        if comment.parent_id and str(comment.parent.author_id) != sender_id:
            _add(str(comment.parent.author_id), InboxItem.Verb.TASK_COMMENTED)

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
                _add(str(uid), InboxItem.Verb.TASK_MENTIONED)

        if not recipients:
            return

        # ── Shared payload fields (computed once, reused for every row) ───────
        _VERB_TO_EVENT = {
            InboxItem.Verb.TASK_COMMENTED: "commented",
            InboxItem.Verb.TASK_MENTIONED: "mentioned",
            InboxItem.Verb.TASK_ASSIGNED: "assigned",
            InboxItem.Verb.APPROVAL_REQUESTED: "approved",
        }
        meta = {
            "task_id": str(task.id),
            "task_title": task.title,
            "board_id": str(task.board_id),
            "workspace_id": format_id(workspace.PREFIX, workspace.id),
        }
        actor_name = sender.full_name or sender.email
        board_id_str = str(task.board_id)
        project_name = task.board.name if task.board_id else ""

        # ── One INSERT for all notifications ──────────────────────────────────
        items = InboxItem.objects.bulk_create([
            InboxItem(
                user_id=user_id,
                workspace=workspace,
                actor_id=str(sender.id),
                actor_name=actor_name,
                verb=verb,
                event_type=_VERB_TO_EVENT.get(verb, "commented"),
                resource_name=task.title,
                board_id=board_id_str,
                project_name=project_name,
                meta=meta,
            )
            for user_id, verb in recipients
        ])

        # ── Push to each recipient's WebSocket channel ────────────────────────
        # Can't batch across different user channels; Redis pub/sub keeps each call fast.
        for item, (user_id, verb) in zip(items, recipients):
            broadcast_to_user(
                user_id,
                "notification.created",
                {
                    "id": format_id(item.PREFIX, item.id),
                    "actor_id": str(sender.id),
                    "actor_name": actor_name,
                    "verb": verb,
                    "event_type": _VERB_TO_EVENT.get(verb, "commented"),
                    "resource_name": task.title,
                    "board_id": board_id_str,
                    "project_name": project_name,
                    "meta": meta,
                    "status": "unread",
                    "created_at": item.created_at.isoformat(),
                },
            )

    except Exception as exc:
        raise self.retry(exc=exc)
