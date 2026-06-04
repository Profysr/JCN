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
        TASK_ASSIGNED        = "task_assigned",        "assigned you a task"
        TASK_COMMENTED       = "task_commented",       "commented on your task"
        TASK_MENTIONED       = "task_mentioned",       "mentioned you in a comment"
        APPROVAL_REQUESTED   = "approval_requested",   "requested your approval"

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


# ── v3.7.0 — Notifications Hub v2 ────────────────────────────────────────────

class InboxItem(models.Model):
    """Persistent notification inbox — one row per user event, survives bell dismissals."""
    class Status(models.TextChoices):
        UNREAD   = "unread",   "Unread"
        READ     = "read",     "Read"
        ARCHIVED = "archived", "Archived"
        SNOOZED  = "snoozed",  "Snoozed"

    class EventType(models.TextChoices):
        ASSIGNED   = "assigned",   "Assigned"
        MENTIONED  = "mentioned",  "Mentioned"
        COMMENTED  = "commented",  "Commented"
        APPROVED   = "approved",   "Approval"
        AUTOMATED  = "automated",  "Automated"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="inbox_items")
    workspace    = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="inbox_items")
    notification = models.OneToOneField(
        Notification, on_delete=models.CASCADE,
        related_name="inbox_item", null=True, blank=True,
    )
    # Denormalized so the inbox renders without extra queries
    actor_id     = models.CharField(max_length=100, blank=True)
    actor_name   = models.CharField(max_length=255, blank=True)
    verb         = models.CharField(max_length=50)
    event_type   = models.CharField(max_length=20, choices=EventType.choices, default=EventType.ASSIGNED)
    resource_name = models.CharField(max_length=500, blank=True)
    project_id    = models.CharField(max_length=100, blank=True)
    project_name  = models.CharField(max_length=255, blank=True)
    meta          = models.JSONField(default=dict)
    status        = models.CharField(max_length=20, choices=Status.choices, default=Status.UNREAD)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"InboxItem for {self.user.email}: {self.verb}"


class NotificationPreference(models.Model):
    """Per-user per-event-type notification control (in-app + email frequency)."""
    class Frequency(models.TextChoices):
        INSTANT = "instant", "Instant"
        DIGEST  = "digest",  "Digest"
        OFF     = "off",     "Off"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_prefs")
    workspace  = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="notification_prefs")
    event_type = models.CharField(max_length=20, choices=InboxItem.EventType.choices)
    in_app     = models.BooleanField(default=True)
    email      = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.INSTANT)
    # Optional per-project override — null = applies workspace-wide
    project_id_override = models.CharField(max_length=100, blank=True)
    quiet_hours_start   = models.TimeField(null=True, blank=True)
    quiet_hours_end     = models.TimeField(null=True, blank=True)
    digest_hour         = models.PositiveSmallIntegerField(default=9)
    created_at          = models.DateTimeField(auto_now_add=True)
    updated_at          = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["user", "workspace", "event_type", "project_id_override"]

    def __str__(self):
        return f"{self.user.email} / {self.event_type}: in_app={self.in_app} email={self.email}"


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
