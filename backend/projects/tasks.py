"""
Celery tasks for the projects app.
"""
import logging

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.utils import timezone

logger = logging.getLogger(__name__)


def _broadcast_import(workspace_slug, job_id, status, progress_pct,
                      imported=0, skipped=0, total=0, error=None):
    """Push an import.progress event to the workspace WebSocket group."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"workspace_{workspace_slug}",
            {
                "type": "workspace.event",
                "data": {
                    "type": "import.progress",
                    "payload": {
                        "job_id":       str(job_id),
                        "status":       status,
                        "progress_pct": progress_pct,
                        "imported":     imported,
                        "skipped":      skipped,
                        "total":        total,
                        "error":        error,
                    },
                },
            },
        )
    except Exception as exc:
        logger.warning("import broadcast failed: %s", exc)


@shared_task(bind=True)
def run_import(self, job_id):
    """
    Execute an ImportJob:
    1. Walk parsed_rows applying field_mapping.
    2. Create Task objects, resolving status / assignee by name/email.
    3. Broadcast progress every 5% via WebSocket.
    4. Mark job complete / failed.
    """
    from projects.models import (
        ImportJob, Project, Task, TaskStatus, Label
    )
    from django.contrib.auth import get_user_model
    from projects.importers.base import ParsedTask

    User = get_user_model()

    try:
        job = ImportJob.objects.select_related("workspace", "created_by").get(id=job_id)
    except ImportJob.DoesNotExist:
        logger.error("run_import: job %s not found", job_id)
        return

    ws_slug = job.workspace.slug
    job.status = ImportJob.Status.IMPORTING
    job.save(update_fields=["status"])
    _broadcast_import(ws_slug, job_id, "importing", 0)

    # Resolve or create the target project (use or create "Imported Tasks")
    project, _ = Project.objects.get_or_create(
        workspace=job.workspace,
        name=f"Imported from {job.get_source_display()}",
        defaults={"created_by": job.created_by},
    )

    # Ensure at least the 4 default statuses exist
    default_statuses = [
        ("Backlog", "#94a3b8", 0, False),
        ("In Progress", "#6366f1", 1, False),
        ("In Review", "#f59e0b", 2, False),
        ("Done", "#22c55e", 3, True),
    ]
    existing_names = set(project.statuses.values_list("name", flat=True))
    for name, color, order, is_done in default_statuses:
        if name not in existing_names:
            TaskStatus.objects.create(project=project, name=name, color=color, order=order, is_done=is_done)

    status_map = {s.name.lower(): s for s in project.statuses.all()}
    user_map   = {u.email.lower(): u for u in User.objects.filter(
        workspaces__workspace=job.workspace
    )}

    rows      = job.parsed_rows   # list of ParsedTask.to_dict()
    total     = len(rows)
    imported_ids = []
    skipped   = 0
    errors    = []

    job.total_count = total
    job.save(update_fields=["total_count"])

    last_broadcast_pct = -1

    for i, row_dict in enumerate(rows):
        try:
            pt = ParsedTask.from_dict(row_dict)

            # Duplicate detection: skip if a task with same title + external_id exists
            if pt.external_id and Task.objects.filter(
                project=project,
                title=pt.title,
            ).exists():
                skipped += 1
                continue

            # Resolve status
            status_obj = (
                status_map.get(pt.status_name.lower())
                or status_map.get("backlog")
                or project.statuses.order_by("order").first()
            )

            # Resolve assignee
            assignee = user_map.get((pt.assignee_email or "").lower())

            task = Task.objects.create(
                project        = project,
                title          = pt.title,
                description    = pt.description,
                status         = status_obj,
                priority       = pt.priority,
                task_type      = pt.task_type,
                assignee       = assignee,
                due_date       = pt.due_date or None,
                start_date     = pt.start_date or None,
                estimate_hours = pt.estimate_hours,
                created_by     = job.created_by,
            )

            # Labels
            for label_name in pt.labels:
                label, _ = Label.objects.get_or_create(
                    project=project, name=label_name[:50],
                    defaults={"color": "#94a3b8"},
                )
                task.labels.add(label)

            imported_ids.append(str(task.id))

        except Exception as exc:
            errors.append({"row": i, "error": str(exc)[:200]})
            skipped += 1
            logger.warning("import row %d failed: %s", i, exc)

        # Broadcast every 5%
        pct = int((i + 1) / total * 100) if total else 100
        if pct >= last_broadcast_pct + 5:
            last_broadcast_pct = pct
            job.progress_pct   = pct
            job.imported_count = len(imported_ids)
            job.skipped_count  = skipped
            job.save(update_fields=["progress_pct", "imported_count", "skipped_count"])
            _broadcast_import(ws_slug, job_id, "importing", pct,
                              imported=len(imported_ids), skipped=skipped, total=total)

    # Finalise
    job.status            = ImportJob.Status.COMPLETE
    job.progress_pct      = 100
    job.imported_count    = len(imported_ids)
    job.skipped_count     = skipped
    job.imported_task_ids = imported_ids
    job.error_log         = errors
    job.completed_at      = timezone.now()
    job.save()

    _broadcast_import(ws_slug, job_id, "complete", 100,
                      imported=len(imported_ids), skipped=skipped, total=total)
