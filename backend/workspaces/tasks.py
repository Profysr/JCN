"""
Celery tasks for workspaces app.
"""
import hashlib
import hmac
import json
import logging
import time

import requests
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def deliver_webhook(self, webhook_id, event, payload_dict):
    """
    Deliver a webhook payload with HMAC signing.
    Retries: attempt 1 immediately, attempt 2 after 5 min, attempt 3 after 30 min.
    """
    from workspaces.models import Webhook, WebhookDelivery

    try:
        webhook = Webhook.objects.get(id=webhook_id, is_active=True)
    except Webhook.DoesNotExist:
        return

    body        = json.dumps(payload_dict, default=str)
    timestamp   = str(int(time.time()))
    sig_input   = f"{timestamp}.{body}"
    signature   = hmac.new(
        webhook.secret.encode(), sig_input.encode(), hashlib.sha256
    ).hexdigest()

    headers = {
        "Content-Type":     "application/json",
        "X-JCN-Event":      event,
        "X-JCN-Timestamp":  timestamp,
        "X-JCN-Signature":  f"sha256={signature}",
        "X-JCN-Delivery":   str(self.request.id or "unknown"),
    }

    attempt    = (self.request.retries or 0) + 1
    start      = time.time()
    resp_code  = None
    resp_body  = ""
    success    = False

    try:
        resp      = requests.post(webhook.url, data=body, headers=headers, timeout=10)
        resp_code = resp.status_code
        resp_body = resp.text[:4000]
        success   = 200 <= resp_code < 300
    except Exception as exc:
        resp_body = str(exc)[:500]
        logger.warning("Webhook delivery failed (attempt %d): %s", attempt, exc)

    duration_ms = int((time.time() - start) * 1000)

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

    if not success and attempt < 3:
        # Exponential backoff: 5 min → 30 min
        countdown = 300 if attempt == 1 else 1800
        raise self.retry(countdown=countdown)
