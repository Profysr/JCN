"""
Django signals — fires automation rules on task mutations (v2.7.0).
Connected in ProjectsConfig.ready().
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver


@receiver(pre_save, sender="projects.Task")
def task_pre_save(sender, instance, **kwargs):
    """Capture old field values before the save so post_save can diff them."""
    if instance.pk is None:
        return  # new object — nothing to diff
    try:
        old = sender.objects.get(pk=instance.pk)
        instance._status_changed  = old.status_id  != instance.status_id
        instance._assignee_changed = old.assignee_id != instance.assignee_id
        instance._old_status      = str(old.status_id) if old.status_id else None
    except sender.DoesNotExist:
        pass


@receiver(post_save, sender="projects.Task")
def task_post_save(sender, instance, created, **kwargs):
    # ‼️ Automation disabled — fire_automation is a no-op stub until the engine is rebuilt.
    # from .automation import fire_automation
    # if created:
    #     fire_automation("task.created", instance)
    #     return
    # if getattr(instance, "_status_changed", False):
    #     fire_automation("task.status_changed", instance, context={"from": instance._old_status, "to": str(instance.status_id)})
    # if getattr(instance, "_assignee_changed", False):
    #     fire_automation("task.assigned", instance)
    pass
