import uuid
from django.db import models
from django.conf import settings


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=255)
    logo = models.ImageField(upload_to="workspace_logos/", null=True, blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="owned_workspaces")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class WorkspaceMember(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="workspace_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="sent_invites"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "user"]

    def __str__(self):
        return f"{self.user.email} @ {self.workspace.name} ({self.role})"


class WorkspaceInvite(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="invites")
    email = models.EmailField()
    role = models.CharField(max_length=20, choices=WorkspaceMember.Role.choices, default=WorkspaceMember.Role.MEMBER)
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_invites")
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "email"]

    def __str__(self):
        return f"Invite: {self.email} to {self.workspace.name}"


class Notification(models.Model):
    class Verb(models.TextChoices):
        TASK_ASSIGNED  = "task_assigned",  "assigned you a task"
        TASK_COMMENTED = "task_commented", "commented on your task"
        TASK_MENTIONED = "task_mentioned", "mentioned you in a comment"

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    actor     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="sent_notifications")
    verb      = models.CharField(max_length=30, choices=Verb.choices)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="notifications")
    meta      = models.JSONField(default=dict)  # task_id, task_title, project_id, workspace_slug
    read      = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.actor} → {self.recipient}: {self.verb}"


# ── v2.3.0 — Onboarding ───────────────────────────────────────────────────────

class OnboardingState(models.Model):
    """Tracks wizard + checklist progress per workspace."""
    workspace        = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name="onboarding")
    wizard_completed    = models.BooleanField(default=False)
    team_type           = models.CharField(max_length=50, blank=True)
    checklist_dismissed = models.BooleanField(default=False)   # legacy, kept for migration compat
    # Per-user dismissal: list of user UUID strings who have dismissed the checklist
    dismissed_by_users  = models.JSONField(default=list, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Onboarding: {self.workspace.name}"
