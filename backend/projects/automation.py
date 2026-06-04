"""
Automation engine — evaluates AutomationRule conditions and runs actions
when task events fire. Called from Django signals in signals.py.

Supported triggers:
  task.created, task.status_changed, task.assigned, task.overdue
  approval.approved, approval.rejected  (v3.6.0)

Supported conditions:
  priority equals/not_equals, assignee is_set/is_not_set, status equals

Supported actions:
  change_status, change_priority, set_assignee, add_label,
  send_notification, post_comment
"""
import time
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


def _eval_condition(task, cond):
    field    = cond.get("field")
    operator = cond.get("operator")
    value    = cond.get("value")

    if field == "priority":
        if operator == "equals":      return task.priority == value
        if operator == "not_equals":  return task.priority != value

    if field == "assignee":
        if operator == "is_set":     return task.assignee_id is not None
        if operator == "is_not_set": return task.assignee_id is None

    if field == "status":
        if operator == "equals": return str(task.status_id) == str(value)

    if field == "task_type":
        if operator == "equals": return task.task_type == value

    return True  # unknown condition — pass through


def _run_action(task, action, actor):
    from .models import TaskStatus, Label, TaskComment
    from workspaces.models import Notification
    action_type = action.get("type")
    payload     = action.get("payload", {})

    if action_type == "change_status":
        status_id = payload.get("status_id")
        if not status_id:
            return False, "change_status: status_id is required in payload"
        try:
            new_status = TaskStatus.objects.get(id=status_id, project=task.project)
            task.status = new_status
            task.save(update_fields=["status", "updated_at"])
            return True, "change_status: ok"
        except TaskStatus.DoesNotExist:
            return False, f"change_status: status {status_id} not found"

    if action_type == "change_priority":
        priority = payload.get("priority")
        valid = [c[0] for c in task.Priority.choices]
        if priority not in valid:
            return False, f"change_priority: invalid priority '{priority}', must be one of {valid}"
        task.priority = priority
        task.save(update_fields=["priority", "updated_at"])
        return True, f"change_priority: set to {priority}"

    if action_type == "set_assignee":
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user_id = payload.get("user_id")
        if user_id:
            try:
                user = User.objects.get(id=user_id)
                task.assignee = user
                task.save(update_fields=["assignee", "updated_at"])
                return True, "set_assignee: ok"
            except User.DoesNotExist:
                return False, f"set_assignee: user {user_id} not found"

    if action_type == "add_label":
        label_id = payload.get("label_id")
        if label_id:
            try:
                label = Label.objects.get(id=label_id, project=task.project)
                task.labels.add(label)
                return True, "add_label: ok"
            except Label.DoesNotExist:
                return False, f"add_label: label {label_id} not found"

    if action_type == "post_comment":
        body = payload.get("body", "")
        if body and actor:
            TaskComment.objects.create(task=task, author=actor, body=body)
            return True, "post_comment: ok"

    if action_type == "send_notification":
        from django.contrib.auth import get_user_model
        User = get_user_model()
        recipient_id = payload.get("user_id") or (str(task.assignee_id) if task.assignee_id else None)
        if recipient_id:
            try:
                recipient = User.objects.get(id=recipient_id)
                workspace = task.project.workspace
                meta = {"task_id": str(task.id), "task_title": task.title, "message": payload.get("message", "")}
                notif = Notification.objects.create(
                    workspace=workspace,
                    recipient=recipient,
                    actor=actor,
                    verb=Notification.Verb.TASK_ASSIGNED,
                    meta=meta,
                )
                # v3.7.0 — also create InboxItem for automation-triggered notifications
                from workspaces.models import InboxItem
                InboxItem.objects.create(
                    user=recipient,
                    workspace=workspace,
                    notification=notif,
                    actor_id=str(actor.id) if actor else "",
                    actor_name=(actor.full_name or actor.email) if actor else "Automation",
                    verb=Notification.Verb.TASK_ASSIGNED,
                    event_type="automated",
                    resource_name=task.title,
                    project_id=str(task.project_id),
                    project_name=task.project.name,
                    meta=meta,
                )
                return True, "send_notification: ok"
            except User.DoesNotExist:
                return False, f"send_notification: user {recipient_id} not found"

    return False, f"unknown action type: {action_type}"


def fire_automation(trigger_type, task, actor=None, context=None):
    """
    Evaluate all active rules for this project matching trigger_type.
    Called synchronously from Django signals — fast actions only.
    """
    from .models import AutomationRule, AutomationLog

    rules = AutomationRule.objects.filter(
        project=task.project,
        is_active=True,
        trigger__type=trigger_type,
    ).prefetch_related()

    for rule in rules:
        start = time.monotonic()
        actions_run = []
        overall_ok  = True

        # Evaluate all conditions (AND logic)
        all_pass = all(_eval_condition(task, c) for c in (rule.conditions or []))
        if not all_pass:
            continue

        # Run all actions
        for action in (rule.actions or []):
            try:
                ok, msg = _run_action(task, action, actor)
                actions_run.append({"type": action.get("type"), "ok": ok, "msg": msg})
                if not ok:
                    overall_ok = False
            except Exception as exc:
                logger.exception("Automation action error for rule %s", rule.id)
                actions_run.append({"type": action.get("type"), "ok": False, "msg": str(exc)})
                overall_ok = False

        duration_ms = int((time.monotonic() - start) * 1000)
        exec_status = "success" if overall_ok else ("partial" if actions_run else "failed")

        AutomationLog.objects.create(
            rule=rule,
            task=task,
            trigger_payload={"type": trigger_type, **(context or {})},
            actions_run=actions_run,
            exec_status=exec_status,
            duration_ms=duration_ms,
        )
        rule.fire_count += 1
        rule.save(update_fields=["fire_count"])
