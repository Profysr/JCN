import logging
from typing import List, Dict, Any

import resend
from celery import shared_task
from django.conf import settings

from .events import broadcast_to_user
from .emails import render as render_email
from .models import OrgProfile
from workspaces.models import InboxItem
from workspaces import access

logger = logging.getLogger(__name__)

# ==========================================
# REUSABLE HELPERS & NOTIFICATION SERVICES
# ==========================================


def create_inbox_items_and_broadcast(
    users: List[Any],
    workspace: Any,
    actor_id: str,
    actor_name: str,
    verb: str,
    resource_name: str,
    meta: Dict[str, Any],
) -> None:
    """Creates InboxItem instances in bulk and broadcasts real-time push notifications."""
    inbox_items = [
        InboxItem(
            user=user,
            workspace=workspace,
            actor_id=actor_id,
            actor_name=actor_name,
            verb=verb,
            event_type=InboxItem.EventType.ORG,
            resource_name=resource_name,
            meta=meta,
        )
        for user in users
    ]

    # Bulk create for efficiency (or falls back to single creation if list length is 1)
    created_items = InboxItem.objects.bulk_create(inbox_items)

    for item in created_items:
        payload = {
            "id": str(item.id),
            "verb": verb,
            "event_type": InboxItem.EventType.ORG,
            "actor_name": actor_name,
            "resource_name": resource_name,
            "meta": meta,
            "status": "unread",
        }
        broadcast_to_user(str(item.user_id), "notification.created", payload)


def send_resend_email(
    to_emails: List[str], subject: str, template_name: str, context: Dict[str, Any]
) -> None:
    """Wrapper function to uniformly dispatch emails through the Resend API."""
    resend.api_key = settings.RESEND_API_KEY
    html_content = render_email(template_name, context)

    resend.Emails.send(
        {
            "from": settings.FROM_EMAIL,
            "to": to_emails,
            "subject": subject,
            "html": html_content,
        }
    )


# ==========================================
# CELERY TASKS
# ==========================================


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_hr_profile_submitted(self, profile_id: int) -> None:
    """Inbox + email all workspace admins when a member submits their org profile."""
    try:
        profile = OrgProfile.objects.select_related(
            "member", "member__user", "member__workspace", "job_title"
        ).get(id=profile_id)
    except OrgProfile.DoesNotExist:
        logger.warning("[org_notify] Profile %s not found.", profile_id)
        return

    member = profile.member
    workspace = member.workspace
    member_name = member.user.full_name or member.user.email
    job_title = profile.job_title.name if profile.job_title else "Not set"
    hr_queue_url = f"{settings.FRONTEND_URL}/w/{workspace.id}/org/pending"

    # Filter out the submitting member from receiving their own notification
    admin_members = [
        m for m in access.workspace_admins(workspace) if m.user_id != member.user_id
    ]
    if not admin_members:
        return

    # 1. Create Inboxes and Push Notifications
    meta = {
        "profile_id": str(profile.id),
        "member_id": str(member.id),
        "member_name": member_name,
    }
    admin_users = [m.user for m in admin_members]

    create_inbox_items_and_broadcast(
        users=admin_users,
        workspace=workspace,
        actor_id=str(member.user.id),
        actor_name=member_name,
        verb=InboxItem.Verb.ORG_PROFILE_SUBMITTED,
        resource_name=member_name,
        meta=meta,
    )

    # 2. Dispatch Email Notifications
    # admin_emails = [m.user.email for m in admin_members]
    # email_context = {
    #     "member_name": member_name,
    #     "job_title": job_title,
    #     "workspace_name": workspace.name,
    #     "hr_queue_url": hr_queue_url,
    # }

    # try:
    #     send_resend_email(
    #         to_emails=admin_emails,
    #         subject=f"Profile review needed — {member_name} ({workspace.name})",
    #         template_name="profile_submitted.html",
    #         context=email_context,
    #     )
    #     logger.info("[org_notify] HR notification sent for profile %s", profile_id)
    # except Exception as exc:
    #     logger.warning(
    #         "[org_notify] HR notification failed (attempt %d): %s",
    #         self.request.retries + 1,
    #         exc,
    #     )
    #     raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_member_profile_approved(self, profile_id: int) -> None:
    """Inbox + email the member when their org profile is approved."""
    try:
        profile = OrgProfile.objects.select_related(
            "member",
            "member__user",
            "member__workspace",
            "approved_by",
            "approved_by__user",
        ).get(id=profile_id)
    except OrgProfile.DoesNotExist:
        logger.warning("[org_notify] Profile %s not found.", profile_id)
        return

    member = profile.member
    workspace = member.workspace
    member_email = member.user.email
    member_name = member.user.full_name or member_email
    org_url = f"{settings.FRONTEND_URL}/w/{workspace.id}/departments"

    approver = profile.approved_by
    approver_name = (
        (approver.user.full_name or approver.user.email) if approver else workspace.name
    )

    # 1. Create Inbox and Push Notification (Reusing the uniform function)
    meta = {
        "profile_id": str(profile.id),
        "workspace_name": workspace.name,
    }

    create_inbox_items_and_broadcast(
        users=[member.user],
        workspace=workspace,
        actor_id=str(approver.user_id) if approver else "",
        actor_name=approver_name,
        verb=InboxItem.Verb.ORG_PROFILE_APPROVED,
        resource_name=f"{workspace.name} org profile",
        meta=meta,
    )

    # 2. Dispatch Email Notification
    # email_context = {
    #     "member_name": member_name,
    #     "workspace_name": workspace.name,
    #     "org_url": org_url,
    # }

    # try:
    #     send_resend_email(
    #         to_emails=[member_email],
    #         subject=f"You're approved — welcome to {workspace.name} on JCN",
    #         template_name="profile_approved.html",
    #         context=email_context,
    #     )
    #     logger.info("[org_notify] Approval email sent to %s", member_email)
    # except Exception as exc:
    #     logger.warning(
    #         "[org_notify] Approval email failed (attempt %d): %s",
    #         self.request.retries + 1,
    #         exc,
    #     )
    #     raise self.retry(exc=exc)
