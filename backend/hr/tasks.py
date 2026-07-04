"""Celery tasks for the hr app.

Inbox/WS delivery goes through core.events.push_inbox_items — these tasks only
decide who gets notified and with what metadata.
"""

import logging
from datetime import timedelta
from decimal import Decimal

from celery import shared_task
from django.utils import timezone

from core.events import push_inbox_items
from workspaces import access

from .models import EmployeeDocument, LeaveBalance

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


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def apply_leave_carry_over(self):
    """Carry unused leave into the new year, for policies that opt in
    (`LeavePolicy.carry_over_enabled`, off by default).

    Runs yearly. Only ever reads prior-year balances that haven't been
    processed yet (`carry_over_processed_at` dedup, same pattern as
    `EmployeeDocument.expiry_notified_at`) — safe to re-run.
    """
    today = timezone.localdate()
    prior_year, new_year = today.year - 1, today.year

    balances = LeaveBalance.objects.filter(
        year=prior_year,
        carry_over_processed_at__isnull=True,
        policy__carry_over_enabled=True,
        policy__carry_over_days__gt=0,
        employee__is_active=True,
    ).select_related("policy", "employee__user", "employee__workspace")

    processed = 0
    for balance in balances:
        remaining = max(Decimal("0"), balance.total_days - balance.used_days)
        carry = min(remaining, Decimal(balance.policy.carry_over_days))

        new_balance, created = LeaveBalance.objects.get_or_create(
            employee=balance.employee, policy=balance.policy, year=new_year,
            defaults={
                "total_days": Decimal(balance.policy.days_per_year) + carry,
                "carried_over_days": carry,
            },
        )
        if not created:
            # A leave request already lazily created next year's row before this
            # job ran — add the carry-over on top rather than skip it.
            new_balance.total_days = new_balance.total_days + carry
            new_balance.carried_over_days = new_balance.carried_over_days + carry
            new_balance.save(update_fields=["total_days", "carried_over_days"])

        balance.carry_over_processed_at = timezone.now()
        balance.save(update_fields=["carry_over_processed_at"])
        processed += 1

        if carry > 0:
            employee = balance.employee
            push_inbox_items([{
                "user": employee.user,
                "workspace": employee.workspace,
                "actor_id": "",
                "actor_name": employee.workspace.name,
                "verb": "leave.carried_over",
                "resource_name": balance.policy.name,
                "meta": {
                    "policy_id": str(balance.policy_id),
                    "policy_name": balance.policy.name,
                    "carried_over_days": str(carry),
                    "year": new_year,
                },
            }])

    return processed
