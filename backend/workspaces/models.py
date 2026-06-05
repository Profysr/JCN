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

# ── v4.5.0 — Public API & Webhooks ───────────────────────────────────────────

import hashlib
import secrets


class WorkspaceAPIKey(models.Model):
    """
    A long-lived API key scoped to a workspace.
    The raw key is shown exactly once at creation time; we only store the SHA-256 hash.
    """
    class Scope(models.TextChoices):
        READ  = "read",  "Read"
        WRITE = "write", "Write"
        ADMIN = "admin", "Admin"

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace    = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="api_keys")
    name         = models.CharField(max_length=100)
    key_prefix   = models.CharField(max_length=12)          # "jcn_xxxxxxxx" — shown in list UI
    key_hash     = models.CharField(max_length=64, unique=True)  # sha256 hex
    scopes       = models.JSONField(default=list)            # ["read", "write"]
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at   = models.DateTimeField(null=True, blank=True)
    created_by   = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="api_keys"
    )
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def generate(cls, workspace, name, scopes, created_by, expires_at=None):
        """
        Creates a new API key.  Returns (instance, raw_key).
        raw_key is only available at this point — never stored.
        """
        raw   = "jcn_" + secrets.token_hex(32)   # 68-char key
        h     = hashlib.sha256(raw.encode()).hexdigest()
        prefix = raw[:12]
        key = cls.objects.create(
            workspace=workspace,
            name=name,
            key_prefix=prefix,
            key_hash=h,
            scopes=scopes,
            created_by=created_by,
            expires_at=expires_at,
        )
        return key, raw

    @classmethod
    def authenticate(cls, raw_key):
        """Returns the WorkspaceAPIKey for a raw key, or None."""
        from django.utils import timezone
        if not raw_key or not raw_key.startswith("jcn_"):
            return None
        h = hashlib.sha256(raw_key.encode()).hexdigest()
        try:
            key = cls.objects.select_related("workspace", "created_by").get(
                key_hash=h, is_active=True
            )
        except cls.DoesNotExist:
            return None
        if key.expires_at and key.expires_at < timezone.now():
            return None
        cls.objects.filter(pk=key.pk).update(last_used_at=timezone.now())
        return key

    def __str__(self):
        return f"{self.name} ({self.key_prefix}…)"


class Webhook(models.Model):
    """Outbound webhook — fires signed POST requests on task/sprint events."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace  = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="webhooks")
    name       = models.CharField(max_length=100)
    url        = models.CharField(max_length=1024)
    # e.g. ["task.created", "task.updated", "task.completed", "sprint.started"]
    events     = models.JSONField(default=list)
    secret     = models.CharField(max_length=64)   # HMAC signing secret
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    @classmethod
    def create_with_secret(cls, **kwargs):
        kwargs["secret"] = secrets.token_hex(32)
        return cls.objects.create(**kwargs)

    def __str__(self):
        return f"{self.name} → {self.url[:60]}"


class WebhookDelivery(models.Model):
    """Immutable log of every webhook delivery attempt."""
    id             = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    webhook        = models.ForeignKey(Webhook, on_delete=models.CASCADE, related_name="deliveries")
    event          = models.CharField(max_length=64)
    request_body   = models.TextField()
    response_code  = models.IntegerField(null=True, blank=True)
    response_body  = models.TextField(blank=True)
    duration_ms    = models.IntegerField(null=True, blank=True)
    success        = models.BooleanField(default=False)
    attempt        = models.PositiveSmallIntegerField(default=1)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.event} → {self.webhook.url[:40]} ({self.response_code})"


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
