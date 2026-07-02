import logging

import resend
from celery import shared_task
from django.conf import settings

from .events import broadcast_to_user

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_hr_profile_submitted(self, profile_id):
    """Inbox + email all workspace admins when a member submits their org profile."""
    from .models import OrgProfile
    from .emails import render as render_email
    from workspaces.models import WorkspaceMember, InboxItem

    try:
        profile = OrgProfile.objects.select_related(
            "member", "member__user", "member__workspace", "job_title"
        ).get(id=profile_id)
    except OrgProfile.DoesNotExist:
        return

    workspace = profile.member.workspace
    member = profile.member
    member_name = member.user.full_name or member.user.email
    job_title = profile.job_title.name if profile.job_title else "Not set"
    hr_queue_url = f"{settings.FRONTEND_URL}/w/{workspace.id}/org/pending"

    # All admins + owner (excluding the submitter themselves)
    admin_members = list(
        WorkspaceMember.objects.filter(workspace=workspace, role="admin")
        .exclude(user=member.user)
        .select_related("user")
    )
    owner = workspace.owner
    if owner != member.user and not any(m.user == owner for m in admin_members):
        owner_member = WorkspaceMember.objects.filter(workspace=workspace, user=owner).first()
        if owner_member:
            admin_members.append(owner_member)

    if not admin_members:
        return

    # ── InboxItem rows (one per admin) ──
    meta = {
        "profile_id": str(profile.id),
        "member_id": str(member.id),
        "member_name": member_name,
    }
    inbox_items = [
        InboxItem(
            user=m.user,
            workspace=workspace,
            actor_id=str(member.user.id),
            actor_name=member_name,
            verb=InboxItem.Verb.ORG_PROFILE_SUBMITTED,
            event_type=InboxItem.EventType.ORG,
            resource_name=member_name,
            meta=meta,
        )
        for m in admin_members
    ]
    created = InboxItem.objects.bulk_create(inbox_items)

    # ── Real-time push per admin ──
    notification_payload = {
        "verb": InboxItem.Verb.ORG_PROFILE_SUBMITTED,
        "event_type": InboxItem.EventType.ORG,
        "actor_name": member_name,
        "resource_name": member_name,
        "meta": meta,
        "status": "unread",
    }
    for item in created:
        notification_payload["id"] = str(item.id)
        broadcast_to_user(str(item.user_id), "notification.created", notification_payload)

    # ── Email ──
    admin_emails = [m.user.email for m in admin_members]
    html = render_email("profile_submitted.html", {
        "member_name": member_name,
        "job_title": job_title,
        "workspace_name": workspace.name,
        "hr_queue_url": hr_queue_url,
    })
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.FROM_EMAIL,
            "to": admin_emails,
            "subject": f"Profile review needed — {member_name} ({workspace.name})",
            "html": html,
        })
        logger.info("[org_notify] HR notification sent for profile %s", profile_id)
    except Exception as exc:
        logger.warning("[org_notify] HR notification failed (attempt %d): %s", self.request.retries + 1, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_member_profile_approved(self, profile_id):
    """Inbox + email the member when their org profile is approved."""
    from .models import OrgProfile
    from .emails import render as render_email
    from workspaces.models import InboxItem

    try:
        profile = OrgProfile.objects.select_related(
            "member", "member__user", "member__workspace", "approved_by", "approved_by__user"
        ).get(id=profile_id)
    except OrgProfile.DoesNotExist:
        return

    workspace = profile.member.workspace
    member = profile.member
    member_email = member.user.email
    member_name = member.user.full_name or member_email
    org_url = f"{settings.FRONTEND_URL}/w/{workspace.id}/departments"

    approver = profile.approved_by
    approver_name = (approver.user.full_name or approver.user.email) if approver else workspace.name

    # ── InboxItem for the member ──
    meta = {
        "profile_id": str(profile.id),
        "workspace_name": workspace.name,
    }
    inbox_item = InboxItem.objects.create(
        user=member.user,
        workspace=workspace,
        actor_id=str(approver.user_id) if approver else "",
        actor_name=approver_name,
        verb=InboxItem.Verb.ORG_PROFILE_APPROVED,
        event_type=InboxItem.EventType.ORG,
        resource_name=f"{workspace.name} org profile",
        meta=meta,
    )

    # ── Real-time push ──
    broadcast_to_user(str(member.user_id), "notification.created", {
        "id": str(inbox_item.id),
        "verb": InboxItem.Verb.ORG_PROFILE_APPROVED,
        "event_type": InboxItem.EventType.ORG,
        "actor_name": approver_name,
        "resource_name": f"{workspace.name} org profile",
        "meta": meta,
        "status": "unread",
    })

    # ── Email ──
    html = render_email("profile_approved.html", {
        "member_name": member_name,
        "workspace_name": workspace.name,
        "org_url": org_url,
    })
    try:
        resend.api_key = settings.RESEND_API_KEY
        resend.Emails.send({
            "from": settings.FROM_EMAIL,
            "to": [member_email],
            "subject": f"You're approved — welcome to {workspace.name} on JCN",
            "html": html,
        })
        logger.info("[org_notify] Approval email sent to %s", member_email)
    except Exception as exc:
        logger.warning("[org_notify] Approval email failed (attempt %d): %s", self.request.retries + 1, exc)
        raise self.retry(exc=exc)
