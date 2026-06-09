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

import requests
from celery import shared_task
from .models import Webhook, WebhookDelivery

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
