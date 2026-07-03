"""Celery tasks for the integrations app.

Queued by core.events.broadcast() (the "chat" surface of the EVENTS registry) —
never call .delay() on these from views directly; go through broadcast() so
the entry point stays single.
"""

import logging

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

PRIORITY_EMOJI = {
    "urgent": "🔴",
    "high":   "🟠",
    "medium": "🟡",
    "low":    "🔵",
    "none":   "⚪",
}


def _task_resource(task, workspace_id):
    """Build the generic chat `resource` dict from a Task."""
    priority = getattr(task, "priority", "none") or "none"
    return {
        "title": task.title,
        "subtitle": task.board.name,
        "facts": {"Board": task.board.name, "Priority": f"{PRIORITY_EMOJI.get(priority, '⚪')} {priority.title()}"},
        "url": f"{settings.FRONTEND_URL}/w/{workspace_id}/boards/{task.board_id}?task={task.id}",
    }


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def send_chat_notification(self, workspace_id, verb, actor_id, task_id=None, resource=None):
    """Fan an event out to all mapped Teams / Google Chat channels.

    Event-scoped: one message per event per channel (not per recipient).
    Pass task_id for task events (the resource dict is built from the task and
    board-mapped channels are included); pass resource for anything else
    (org/HR/workspace events — workspace-wide channels only).
    """
    from accounts.models import User
    from workspaces.models import Workspace

    from .services import fanout_notification

    try:
        workspace = Workspace.objects.get(id=workspace_id)
        actor = User.objects.get(id=actor_id)
    except (Workspace.DoesNotExist, User.DoesNotExist) as exc:
        logger.info("[chat_notify] skipped verb=%s: %s", verb, exc)
        return

    board = None
    if task_id:
        from projects.models import Task

        try:
            task = Task.objects.select_related("board").get(id=task_id)
        except Task.DoesNotExist:
            logger.info("[chat_notify] skipped verb=%s: task %s gone", verb, task_id)
            return
        board = task.board
        resource = _task_resource(task, workspace_id)

    if not resource:
        logger.warning("[chat_notify] no resource for verb=%s — nothing to send", verb)
        return

    fanout_notification(workspace, verb, actor, resource, board=board)
