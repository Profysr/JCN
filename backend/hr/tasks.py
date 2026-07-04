"""Celery tasks for the hr app.

Inbox/WS delivery goes through core.events.push_inbox_items — these tasks only
decide who gets notified and with what metadata.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from core.events import push_inbox_items
from workspaces import access

from .models import EmployeeDocument

logger = logging.getLogger(__name__)

DOCUMENT_EXPIRY_WARNING_DAYS = 30


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def check_expiring_documents(self):
    """Flag HR (workspace admins) about employee documents expiring soon.

    Purely a heads-up for HR to manually follow up — never blocks or nags the
    employee. Each document is flagged once (`expiry_notified_at` dedup), not
    re-sent every time this task runs.
    """
    horizon = timezone.now().date() + timedelta(days=DOCUMENT_EXPIRY_WARNING_DAYS)
    docs = EmployeeDocument.objects.filter(
        expiry_notified_at__isnull=True,
        expiry_date__isnull=False,
        expiry_date__lte=horizon,
    ).select_related("employee", "employee__user", "employee__workspace")

    notified_ids = []
    for doc in docs:
        workspace = doc.employee.workspace
        employee_name = doc.employee.user.full_name or doc.employee.user.email
        admin_members = access.workspace_admins(workspace)
        if admin_members:
            push_inbox_items([
                {
                    "user": m.user,
                    "workspace": workspace,
                    "actor_id": "",
                    "actor_name": workspace.name,
                    "verb": "document_expiring",
                    "resource_name": employee_name,
                    "meta": {
                        "document_id": str(doc.id),
                        "employee_id": str(doc.employee_id),
                        "employee_name": employee_name,
                        "doc_type": doc.doc_type,
                        "expiry_date": str(doc.expiry_date),
                    },
                }
                for m in admin_members
            ])
        notified_ids.append(doc.id)

    if notified_ids:
        EmployeeDocument.objects.filter(id__in=notified_ids).update(
            expiry_notified_at=timezone.now()
        )
    return len(notified_ids)
