# Celery tasks for the workspaces app.
#
# What is Celery?
#   Celery is a background task queue. Instead of running slow or unreliable work
#   (like making an outbound HTTP request) inside a Django view — which would make the user wait — you hand the job to Celery and return a response immediately.
#   Celery uses Redis as a "broker": Django drops a message into Redis, and a separate Celery worker process picks it up and executes it.

# How deliver_webhook is triggered:
#   Two places call deliver_webhook.delay(...):
#     1. WebhookTestView (views.py) — when the user clicks "Test webhook" in the UI
#     2. _fire_webhooks()  (projects/views.py) — after real task/sprint events happen
#
#   .delay() is the Celery method that queues the task asynchronously.
#   The Django view returns immediately; the worker runs this function in the background.

# Retry strategy:
#   attempt 1 → runs immediately
#   attempt 2 → 5 minutes later   (if attempt 1 failed)
#   attempt 3 → 30 minutes later  (if attempt 2 failed)
#   After 3 failures the task is abandoned and the delivery is logged as failed.

import hashlib
import hmac
import json
import logging
import time
from itertools import islice

import resend
from django.conf import settings

import requests
from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone
from .models import Webhook, WebhookDelivery
from core.constants import DEFAULT_TASK_STATUSES
from projects.models import Board, Task, TaskStatus, Label

from django.contrib.auth import get_user_model

# Import models/helpers from your apps
from workspaces.models import ImportJob
from .importers.base import ParsedTask

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def deliver_webhook(self, webhook_id, event, payload_dict):
    """
    Send a signed webhook payload to a registered URL and log the result.
    bind=True gives us access to `self` so we can read retry count and call self.retry().
    """
    attempt = (self.request.retries or 0) + 1
    logger.info(
        "[webhook] Starting delivery — webhook_id=%s event=%s attempt=%d",
        webhook_id,
        event,
        attempt,
    )

    # Bail out silently if the webhook was deleted or disabled since it was queued
    try:
        webhook = Webhook.objects.get(id=webhook_id, is_active=True)
    except Webhook.DoesNotExist:
        logger.warning(
            "[webhook] Skipping — webhook %s not found or inactive", webhook_id
        )
        return

    # Serialize payload to JSON
    body = json.dumps(payload_dict, default=str)

    # Build the HMAC-SHA256 signature so the receiver can verify the request is genuine.
    # Format: sha256=HMAC(secret, "{timestamp}.{body}")
    # The receiver recomputes this using their stored secret and compares.
    timestamp = str(int(time.time()))
    sig_input = f"{timestamp}.{body}"
    signature = hmac.new(
        webhook.secret.encode(), sig_input.encode(), hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-JCN-Event": event,  # e.g. "task.created"
        "X-JCN-Timestamp": timestamp,  # Unix timestamp — receiver can reject stale requests
        "X-JCN-Signature": f"sha256={signature}",  # HMAC signature for verification
        "X-JCN-Delivery": str(
            self.request.id or "unknown"
        ),  # Celery task ID for tracing
    }

    logger.debug(
        "[webhook] POST %s  headers=%s  body_len=%d",
        webhook.url,
        list(headers.keys()),
        len(body),
    )

    start = time.time()
    resp_code = None
    resp_body = ""
    success = False

    try:
        resp = requests.post(webhook.url, data=body, headers=headers, timeout=10)
        resp_code = resp.status_code
        resp_body = resp.text[:4000]
        success = 200 <= resp_code < 300
        logger.info(
            "[webhook] Response %d from %s (attempt %d)",
            resp_code,
            webhook.url,
            attempt,
        )
    except Exception as exc:
        resp_body = str(exc)[:500]
        logger.warning(
            "[webhook] Request failed (attempt %d): %s — %s", attempt, webhook.url, exc
        )

    duration_ms = int((time.time() - start) * 1000)

    # Always log the attempt — this is what the delivery history UI reads
    WebhookDelivery.objects.create(
        webhook=webhook,
        event=event,
        request_body=body[:8000],
        response_code=resp_code,
        response_body=resp_body,
        duration_ms=duration_ms,
        success=success,
        attempt=attempt,
    )

    if success:
        logger.info(
            "[webhook] Delivered successfully — webhook_id=%s event=%s duration=%dms",
            webhook_id,
            event,
            duration_ms,
        )
    elif attempt < 3:
        # Exponential backoff: wait longer on each retry to avoid hammering a struggling server
        countdown = 300 if attempt == 1 else 1800  # 5 min → 30 min
        logger.warning(
            "[webhook] Delivery failed — scheduling retry %d in %ds",
            attempt + 1,
            countdown,
        )
        raise self.retry(countdown=countdown)
    else:
        logger.error(
            "[webhook] All 3 attempts failed — giving up on webhook_id=%s event=%s",
            webhook_id,
            event,
        )


# ── vA.2 — Invite Email ───────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def send_invite_email(self, invite_id):
    from .models import WorkspaceInvite

    try:
        invite = WorkspaceInvite.objects.select_related(
            "workspace", "invited_by"
        ).get(id=invite_id, status=WorkspaceInvite.Status.PENDING)
    except WorkspaceInvite.DoesNotExist:
        return

    from .emails import render as render_email

    inviter = invite.invited_by.full_name or invite.invited_by.email
    workspace_name = invite.workspace.name
    accept_url = f"{settings.FRONTEND_URL}/invites/{invite.token}"

    html = render_email("invite.html", {
        "inviter": inviter,
        "workspace_name": workspace_name,
        "initial": workspace_name[0].upper(),
        "role": invite.role.capitalize(),
        "accept_url": accept_url,
        "recipient_email": invite.email,
    })

    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.FROM_EMAIL,
            "to": [invite.email],
            "subject": f"{inviter} invited you to join {workspace_name} on JCN",
            "html": html,
        })
        logger.info("[invite_email] Sent to %s for workspace %s", invite.email, workspace_name)
    except Exception as exc:
        logger.warning("[invite_email] Failed (attempt %d): %s", self.request.retries + 1, exc)
        raise self.retry(exc=exc)


# ── v4.6.0 — Import Runner ────────────────────────────────────────────────────
_IMPORT_CHUNK_SIZE = 100

def _chunked(iterable, size: int):
    """Yield successive fixed-size chunks from *iterable* without buffering the whole sequence."""
    it = iter(iterable)
    while chunk := list(islice(it, size)):
        yield chunk


def _ensure_import_statuses(board, TaskStatus) -> None:
    existing = set(board.statuses.values_list("name", flat=True))
    TaskStatus.objects.bulk_create(
        [
            TaskStatus(board=board, **s)
            for s in DEFAULT_TASK_STATUSES
            if s["name"] not in existing
        ],
        ignore_conflicts=True,
    )


def _broadcast_import(
    workspace_id,
    job_id,
    status,
    progress_pct,
    imported=0,
    skipped=0,
    total=0,
    error=None,
):
    """Push an import.progress event to the workspace WebSocket group."""
    try:
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"workspace_{workspace_id}",
            {
                "type": "workspace.event",
                "data": {
                    "type": "import.progress",
                    "payload": {
                        "job_id": str(job_id),
                        "status": status,
                        "progress_pct": progress_pct,
                        "imported": imported,
                        "skipped": skipped,
                        "total": total,
                        "error": error,
                    },
                },
            },
        )
    except Exception as exc:
        logger.warning("import broadcast failed: %s", exc)

@shared_task(bind=True)
def run_import(self, job_id):
    """
    Orchestrates the entire import lifecycle.
    The logic reads like a bulleted list of high-level steps.
    """
    # 1. Fetch the Job record safely
    try:
        job = ImportJob.objects.select_related("workspace", "created_by").get(id=job_id)
    except ImportJob.DoesNotExist:
        logger.error("run_import: job %s not found", job_id)
        return

    # 2. Set status to importing and notify frontend via WebSockets
    _initialize_job_status(job)

    # 3. Set up Board, Status maps, and User maps
    board, status_map, user_map = _prepare_import_environment(job)

    # 4. Process all rows in atomic chunks
    imported_ids, skipped, errors = _process_import_rows(
        job, board, status_map, user_map
    )

    # 5. Finalize database records and send completion broadcast
    _finalize_job_status(job, imported_ids, skipped, errors)


# ── 2. ISOLATED HELPER FUNCTIONS ──────────────────────────────────────────────
def _initialize_job_status(job):
    """Updates database and triggers the initial 'started' WebSocket notification."""
    job.status = ImportJob.Status.IMPORTING
    job.save(update_fields=["status"])
    _broadcast_import(str(job.workspace.id), job.id, "importing", 0)


def _prepare_import_environment(job):
    """Pre-fetches lookups and sets up board to eliminate N+1 DB operations."""
    User = get_user_model()

    board, _ = Board.objects.get_or_create(
        workspace=job.workspace,
        name=f"Imported from {job.get_source_display()}",
        defaults={"created_by": job.created_by},
    )

    _ensure_import_statuses(board, TaskStatus)

    # Generate high-speed dictionaries/lookups in server RAM
    status_map = {s.name.lower(): s for s in board.statuses.all()}
    user_map = {
        u.email.lower(): u
        for u in User.objects.filter(workspace_memberships__workspace=job.workspace)
    }

    # Sync total count to the database tracker
    job.total_count = len(job.parsed_rows)
    job.save(update_fields=["total_count"])

    return board, status_map, user_map


def _process_import_rows(job, board, status_map, user_map):
    """Loops through rows using chunking strategies and returns operational metrics."""
    existing_titles = set(
        Task.objects.filter(board=board).values_list("title", flat=True)
    )

    imported_ids = []
    skipped = 0
    errors = []
    last_pct = -1
    processed = 0
    total = job.total_count

    for chunk_idx, chunk in enumerate(
        _chunked(enumerate(job.parsed_rows), _IMPORT_CHUNK_SIZE)
    ):
        pending_tasks = []
        label_map = []

        # Step A: Parse raw rows inside this chunk into Memory Instances
        for i, row_dict in chunk:
            try:
                pt = ParsedTask.from_dict(row_dict)
                if pt.external_id and pt.title in existing_titles:
                    skipped += 1
                    continue

                task = _build_task_instance(pt, board, status_map, user_map, job)
                if pt.labels:
                    label_map.append((len(pending_tasks), pt.labels))

                pending_tasks.append(task)

            except Exception as exc:
                errors.append({"row": i, "error": str(exc)[:200]})
                skipped += 1
                logger.warning("import row %d failed: %s", i, exc)

        # Step B: Write this chunk to the database inside a transaction block
        if pending_tasks:
            chunk_success = _execute_bulk_insert(
                pending_tasks, label_map, board, existing_titles, imported_ids
            )
            if not chunk_success:
                skipped += len(pending_tasks)
                errors.append(
                    {
                        "chunk": chunk_idx,
                        "error": "Database write conflict or transaction rollback",
                    }
                )

        # Step C: Increment metrics and handle periodic 5% step live broadcasts
        processed += len(chunk)
        pct = int(processed / total * 100) if total else 100

        if pct >= last_pct + 5:
            last_pct = pct
            _save_and_broadcast_progress(job, pct, len(imported_ids), skipped, total)

    return imported_ids, skipped, errors


def _build_task_instance(pt, board, status_map, user_map, job):
    """Maps custom parsed dictionary keys onto a clean Django Task model instance."""
    status_obj = (
        status_map.get(pt.status_name.lower())
        or status_map.get("backlog")
        or board.statuses.order_by("order").first()
    )
    return Task(
        board=board,
        title=pt.title,
        description=pt.description,
        status=status_obj,
        priority=pt.priority,
        task_type=pt.task_type,
        assignee=user_map.get((pt.assignee_email or "").lower()),
        due_date=pt.due_date or None,
        start_date=pt.start_date or None,
        estimate_hours=pt.estimate_hours,
        created_by=job.created_by,
    )


def _execute_bulk_insert(
    pending_tasks, label_map, board, existing_titles, imported_ids
):
    """Executes atomic SQL multi-table bulk writes. Returns False if aborted."""
    LabelThrough = Task.labels.through
    try:
        with transaction.atomic():
            Task.objects.bulk_create(pending_tasks)

            # Map up dynamic tags/labels if rows contain them
            if label_map:
                all_label_names = {name for _, names in label_map for name in names}
                label_objs = {}
                for name in all_label_names:
                    lbl, _ = Label.objects.get_or_create(
                        board=board,
                        name=name[:50],
                        defaults={"color": "#94a3b8"},
                    )
                    label_objs[name] = lbl

                LabelThrough.objects.bulk_create(
                    [
                        LabelThrough(
                            task_id=pending_tasks[idx].id, label_id=label_objs[name].id
                        )
                        for idx, names in label_map
                        for name in names
                    ],
                    ignore_conflicts=True,
                )

        # Update lists after transaction successfully writes to disk
        for task in pending_tasks:
            imported_ids.append(str(task.id))
            existing_titles.add(task.title)
        return True
    except Exception as exc:
        logger.error("Database chunk execution failed and rolled back: %s", exc)
        return False


def _save_and_broadcast_progress(job, pct, imported_count, skipped, total):
    """Updates periodic tracking fields on the DB and fires a WebSocket update."""
    job.progress_pct = pct
    job.imported_count = imported_count
    job.skipped_count = skipped
    job.save(update_fields=["progress_pct", "imported_count", "skipped_count"])

    _broadcast_import(
        str(job.workspace.id),
        job.id,
        "importing",
        pct,
        imported=imported_count,
        skipped=skipped,
        total=total,
    )


def _finalize_job_status(job, imported_ids, skipped, errors):
    """Marks the ImportJob complete and updates final tracking matrices."""
    job.status = ImportJob.Status.COMPLETE
    job.progress_pct = 100
    job.imported_count = len(imported_ids)
    job.skipped_count = skipped
    job.imported_task_ids = imported_ids
    job.error_log = errors
    job.completed_at = timezone.now()
    job.save()

    _broadcast_import(
        str(job.workspace.id),
        job.id,
        "complete",
        100,
        imported=len(imported_ids),
        skipped=skipped,
        total=job.total_count,
    )
