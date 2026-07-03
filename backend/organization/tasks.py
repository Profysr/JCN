"""Celery tasks for the organization app.

Inbox/WS delivery goes through core.events.push_inbox_items — these tasks only
decide who gets notified and with what metadata.
"""

import logging
from celery import shared_task

from core.events import push_inbox_items
from workspaces import access

from .models import OrgProfile

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_hr_profile_submitted(self, profile_id):
    """Inbox + WS push to all workspace admins when a member submits their org profile."""
    try:
        profile = OrgProfile.objects.select_related(
            "member", "member__user", "member__workspace"
        ).get(id=profile_id)
    except OrgProfile.DoesNotExist:
        logger.warning("[org_notify] Profile %s not found.", profile_id)
        return

    member = profile.member
    workspace = member.workspace
    member_name = member.user.full_name or member.user.email

    # The submitting member never gets their own notification.
    admin_members = [
        m for m in access.workspace_admins(workspace) if m.user_id != member.user_id
    ]
    if not admin_members:
        return

    meta = {
        "profile_id": str(profile.id),
        "member_id": str(member.id),
        "member_name": member_name,
    }
    push_inbox_items([
        {
            "user": m.user,
            "workspace": workspace,
            "actor_id": str(member.user.id),
            "actor_name": member_name,
            "verb": "org_profile_submitted",
            "resource_name": member_name,
            "meta": meta,
        }
        for m in admin_members
    ])


@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def notify_member_profile_approved(self, profile_id):
    """Inbox + WS push to the member when their org profile is approved."""
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
    approver = profile.approved_by
    approver_name = (
        (approver.user.full_name or approver.user.email) if approver else workspace.name
    )

    push_inbox_items([
        {
            "user": member.user,
            "workspace": workspace,
            "actor_id": str(approver.user_id) if approver else "",
            "actor_name": approver_name,
            "verb": "org_profile_approved",
            "resource_name": f"{workspace.name} org profile",
            "meta": {
                "profile_id": str(profile.id),
                "workspace_name": workspace.name,
            },
        }
    ])
