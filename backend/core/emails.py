"""
core/emails.py — THE single email helper (Resend).

Split of responsibilities:
  * Templates stay per-app in <app>/emails/*.html — each app owns its own
    copy and metadata (that's the only part that differs between emails).
  * This module owns the mechanics — template loading, {{key}} substitution,
    and the Resend API call. No app should import `resend` directly.

Usage (from a view, Celery task, or adapter):

    from core.emails import send_email

    send_email(
        to=[invite.email],
        subject=f"{inviter} invited you to join {workspace_name} on JCN",
        app="workspaces",            # app whose emails/ dir holds the template
        template="invite.html",
        context={"inviter": inviter, ...},
    )

How to add a new email:
    1. Drop a new .html file in your app's emails/ folder ({{key}} placeholders).
    2. Call send_email(...) with app= + template= + context=.
    Nothing else — no new helper, no new loader.

send_email RAISES on failure so Celery tasks can retry — wrap in try/except
(or call from a task with self.retry) at the call site.
"""

import logging
import os

import resend
from django.apps import apps as django_apps
from django.conf import settings

logger = logging.getLogger(__name__)


def render_template(app_label, template_name, context):
    """Load <app>/emails/<template_name> and substitute {{key}} placeholders."""
    app_path = django_apps.get_app_config(app_label).path
    path = os.path.join(app_path, "emails", template_name)
    with open(path, encoding="utf-8") as f:
        html = f.read()
    for key, value in context.items():
        html = html.replace(f"{{{{{key}}}}}", str(value))
    return html


def send_email(to, subject, *, app=None, template=None, context=None, html=None):
    """Send an email via Resend. Pass either app+template+context or raw html.

    to: list of recipient addresses.
    Raises on failure (Resend/network errors) — callers decide retry policy.
    """
    if html is None:
        html = render_template(app, template, context or {})

    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({
        "from": settings.FROM_EMAIL,
        "to": to,
        "subject": subject,
        "html": html,
    })
    logger.info("[email] Sent %r to %s", subject, to)
