import uuid
from django.db import models
from django.conf import settings
from core.fields import UUIDv7Field

class Workspace(models.Model):
    PREFIX = "wsp"
    id = UUIDv7Field()
    name = models.CharField(max_length=255)
    logo = models.ImageField(upload_to="workspace_logos/", null=True, blank=True)
    # ── Locale & operating defaults, captured at workspace creation ──────────
    # All optional/defaulted so older workspaces and API-created ones stay valid.
    country = models.CharField(max_length=2, blank=True)   # ISO 3166-1 alpha-2
    timezone = models.CharField(max_length=64, blank=True)  # IANA tz, e.g. "Europe/London"
    currency = models.CharField(max_length=3, blank=True)   # ISO 4217, e.g. "USD"
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_workspaces",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class WorkspaceMember(models.Model):
    PREFIX = "wsm"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workspace_memberships",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sent_invites",
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    # Removing a member deactivates rather than deletes the row, so their HR/org records (leave, attendance, documents, org profile) survive. See WorkspaceMemberDetailView.delete and AcceptInviteView (reactivation).
    is_active = models.BooleanField(default=True, db_index=True)
    deactivated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["workspace", "user"]

    def __str__(self):
        return f"{self.user.email} @ {self.workspace.name}"


class WorkspaceInvite(models.Model):
    PREFIX = "wsi"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"

    # The invite role determines which system CustomRole is assigned on acceptance.
    # Capitalised names match system role names (Admin/Member/Viewer).
    INVITE_ROLE_CHOICES = [
        ("Admin", "Admin"),
        ("Member", "Member"),
        ("Viewer", "Viewer"),
    ]

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="invites"
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20,
        choices=INVITE_ROLE_CHOICES,
        default="Member",
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_invites",
    )
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "email"]
        indexes = [
            models.Index(fields=["workspace", "status"], name="wsinvite_workspace_status_idx"),
        ]

    def __str__(self):
        return f"Invite: {self.email} to {self.workspace.name}"


# ── v3.7.0 — Notifications Hub v2 ────────────────────────────────────────────
class InboxItem(models.Model):
    """Persistent notification inbox — one row per user event, survives bell dismissals."""

    PREFIX = "ibx"

    # Verb strings and their event_type mapping live in ONE place:
    # core.events.NOTIFICATION_VERBS. No choices here — the registry is the contract.
    class Status(models.TextChoices):
        UNREAD = "unread", "Unread"
        READ = "read", "Read"
        ARCHIVED = "archived", "Archived"
        SNOOZED = "snoozed", "Snoozed"

    id = UUIDv7Field()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="inbox_items"
    )
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="inbox_items"
    )
    # Denormalized so the inbox renders without extra queries — avoids joins on every list load.
    actor_id = models.CharField(max_length=100, blank=True)
    actor_name = models.CharField(max_length=255, blank=True)
    verb = models.CharField(max_length=50)
    event_type = models.CharField(max_length=20, default="assigned")
    # APP_REGISTRY key (workspaces/constants.py), derived from the verb via
    # core.events.NOTIFICATION_VERBS at creation time — never set directly.
    # Lets the inbox be filtered/tabbed per app without re-deriving it from verb.
    app = models.CharField(max_length=30, blank=True)
    resource_name = models.CharField(max_length=500, blank=True)
    board_id = models.CharField(max_length=100, blank=True)
    board_name = models.CharField(max_length=255, blank=True)
    meta = models.JSONField(default=dict)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UNREAD
    )
    snoozed_until = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["user", "status"], name="inbox_user_status_idx"),
            models.Index(fields=["user", "workspace", "status"], name="inbox_user_ws_status_idx"),
            models.Index(fields=["user", "workspace", "app", "status"], name="inbox_user_ws_app_status_idx"),
        ]

    def __str__(self):
        return f"InboxItem for {self.user.email}: {self.verb}"


# ── v4.5.0 — Public API & Webhooks ───────────────────────────────────────────
import hashlib
import secrets

class WorkspaceAPIKey(models.Model):
    """
    A long-lived API key scoped to a workspace.
    The raw key is shown exactly once at creation time; we only store the SHA-256 hash.
    """

    PREFIX = "key"

    class Scope(models.TextChoices):
        READ = "read", "Read"
        WRITE = "write", "Write"
        ADMIN = "admin", "Admin"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="api_keys"
    )
    name = models.CharField(max_length=100)
    key_prefix = models.CharField(max_length=12)  # "jcn_xxxxxxxx" — shown in list UI
    key_hash = models.CharField(max_length=64, unique=True)  # sha256 hex
    scopes = models.JSONField(default=list)  # ["read", "write"]
    last_used_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="api_keys",
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    @classmethod
    def generate(cls, **kwargs):
        """
        Creates a new API key.  Returns (instance, raw_key).
        raw_key is only available at this point — never stored.
        """
        raw = "jcn_" + secrets.token_hex(32)  # 68-char key
        instance = cls.objects.create(
            key_prefix=raw[:12],
            key_hash=hashlib.sha256(raw.encode()).hexdigest(),
            **kwargs,
        )
        return instance, raw

    @classmethod
    def authenticate(cls, raw_key):
        """Returns the WorkspaceAPIKey for a raw key, or None."""
        from django.utils import timezone

        if not raw_key or not raw_key.startswith("jcn_"):
            return None
        h = hashlib.sha256(raw_key.encode()).hexdigest()

        # Search api token based on hash
        try:
            key = cls.objects.select_related("workspace", "created_by").get(
                key_hash=h, is_active=True
            )
        except cls.DoesNotExist:
            return None
        # Validate Token Expiry
        if key.expires_at and key.expires_at < timezone.now():
            return None
        # Update last_used_at without modifying updated_at
        cls.objects.filter(pk=key.pk).update(last_used_at=timezone.now())
        return key

    def __str__(self):
        return f"{self.name} ({self.key_prefix}…)"


# API-key scope metadata for the settings UI, served by ApiKeyScopesView so the
# frontend never hardcodes the scope list. Value + label come from the Scope
# enum (single source, also enforced by the serializer's validate_scopes);
# description is UI-only copy with no other home. Add a scope → update here too.
_SCOPE_DESCRIPTIONS = {
    WorkspaceAPIKey.Scope.READ: "Read tasks, projects, and members",
    WorkspaceAPIKey.Scope.WRITE: "Create and update tasks and projects",
    WorkspaceAPIKey.Scope.ADMIN: "Manage workspace settings and members",
}
API_KEY_SCOPES = [
    {"value": s.value, "label": s.label, "description": _SCOPE_DESCRIPTIONS[s]}
    for s in WorkspaceAPIKey.Scope
]


class Webhook(models.Model):
    """Outbound webhook — fires signed POST requests on task/sprint events."""

    PREFIX = "whk"
    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="webhooks"
    )
    name = models.CharField(max_length=100)
    url = models.CharField(max_length=1024)
    # e.g. ["task.created", "task.updated", "task.completed", "sprint.started"]
    events = models.JSONField(default=list)
    secret = models.CharField(max_length=64)  # HMAC signing secret
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    @classmethod
    def create_with_secret(cls, **kwargs):
        kwargs["secret"] = secrets.token_hex(32)
        return cls.objects.create(**kwargs)

    def __str__(self):
        return f"{self.name} → {self.url[:60]}"


class WebhookDelivery(models.Model):
    """Immutable log of every webhook delivery attempt."""

    PREFIX = "wdl"
    id = UUIDv7Field()
    webhook = models.ForeignKey(
        Webhook, on_delete=models.CASCADE, related_name="deliveries"
    )
    event = models.CharField(max_length=64)
    request_body = models.TextField()
    response_code = models.IntegerField(null=True, blank=True)
    response_body = models.TextField(blank=True)
    duration_ms = models.IntegerField(null=True, blank=True)
    success = models.BooleanField(default=False)
    attempt = models.PositiveSmallIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["webhook", "created_at"], name="webhookdel_webhook_created_idx"),
            models.Index(fields=["webhook", "success"], name="webhookdel_webhook_success_idx"),
        ]

    def __str__(self):
        return f"{self.event} → {self.webhook.url[:40]} ({self.response_code})"


# ── v4.6.0 — Import & Migration Tools ────────────────────────────────────────
class ImportJob(models.Model):
    """Tracks a single import operation from an external tool into JCN."""

    PREFIX = "imp"

    class Source(models.TextChoices):
        JIRA    = "jira",    "Jira"
        CLICKUP = "clickup", "ClickUp"
        MONDAY  = "monday",  "Monday"
        NOTION  = "notion",  "Notion"
        GITHUB  = "github",  "GitHub Issues"
        ASANA   = "asana",   "Asana"
        CSV     = "csv",     "Simple CSV"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARSING = "parsing", "Parsing"
        MAPPED = "mapped", "Mapping Ready"
        IMPORTING = "importing", "Importing"
        COMPLETE = "complete", "Complete"
        FAILED = "failed", "Failed"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="import_jobs"
    )
    source = models.CharField(max_length=20, choices=Source.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    file_name = models.CharField(max_length=255, blank=True)
    # Parsed intermediate representation stored as JSON (list of dicts)
    parsed_rows = models.JSONField(default=list)
    # Auto-detected or user-confirmed mapping: {source_field: jcn_field}
    field_mapping = models.JSONField(default=dict)
    # First 10 rows for the preview step
    preview_rows = models.JSONField(default=list)
    
    # Runtime counters updated during import
    progress_pct = models.IntegerField(default=0)
    total_count = models.IntegerField(default=0)
    imported_count = models.IntegerField(default=0)
    skipped_count = models.IntegerField(default=0)
    error_log = models.JSONField(default=list)
    # UUIDs of created Task objects — used for rollback
    imported_task_ids = models.JSONField(default=list)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="import_jobs",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["workspace", "status"], name="importjob_workspace_status_idx"),
        ]

    def __str__(self):
        return f"Import({self.source}) → {self.workspace} [{self.status}]"

# ── v2.3.0 — Onboarding ───────────────────────────────────────────────────────
class OnboardingState(models.Model):
    """Tracks wizard + per-module checklist progress per workspace."""

    workspace = models.OneToOneField(
        Workspace, on_delete=models.CASCADE, related_name="onboarding"
    )
    wizard_completed = models.BooleanField(default=False)
    # Per-user, per-module UI flags in one field so new flags never need a
    # column. Shape: {"<module_key>": {"<flag>": ["<user_id>", ...]}}
    # Flags: dismissed (checklist closed), minimized (collapsed), welcomed
    # (first-open welcome modal shown).
    module_ui_state = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    UI_FLAGS = ("dismissed", "minimized", "welcomed")

    def has_flag(self, module_key, flag, user_id):
        module = (self.module_ui_state or {}).get(module_key) or {}
        return str(user_id) in module.get(flag, [])

    def set_flag(self, module_key, flag, user_id, value):
        state = dict(self.module_ui_state or {})
        module = dict(state.get(module_key) or {})
        users = list(module.get(flag, []))
        uid = str(user_id)
        if value and uid not in users:
            users.append(uid)
        elif not value and uid in users:
            users.remove(uid)
        module[flag] = users
        state[module_key] = module
        self.module_ui_state = state

    def __str__(self):
        return f"Onboarding: {self.workspace.name}"


# ── vD.1 — Custom RBAC ───────────────────────────────────────────────────────
class CustomRole(models.Model):
    """
    Workspace-scoped role carrying a JSON permission map.
    System roles (is_system=True) mirror the legacy admin/member/viewer
    behaviour and are protected from edit/delete.
    """

    PREFIX = "rol"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="custom_roles"
    )
    name = models.CharField(max_length=100)
    description = models.CharField(max_length=500, blank=True)
    is_system = models.BooleanField(default=False)
    # {"projects": true, "people": false, ...}
    app_access = models.JSONField(default=dict)
    # {"projects": {"task.create": true, ...}, "workspace": {"member.invite": true, ...}}
    permissions = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["workspace", "name"]
        ordering = ["-is_system", "name"]

    def __str__(self):
        suffix = " (system)" if self.is_system else ""
        return f"{self.name}{suffix} @ {self.workspace.name}"


class RoleAssignment(models.Model):
    """
    Maps a WorkspaceMember to a CustomRole.
    One-to-one: each member has exactly one active role assignment.
    """

    PREFIX = "rla"

    id = UUIDv7Field()
    workspace_member = models.OneToOneField(
        WorkspaceMember,
        on_delete=models.CASCADE,
        related_name="role_assignment",
    )
    role = models.ForeignKey(
        CustomRole,
        on_delete=models.CASCADE,
        related_name="assignments",
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="role_assignments_made",
    )

    class Meta:
        indexes = [
            models.Index(fields=["role"], name="rla_role_idx"),
        ]

    def __str__(self):
        return f"{self.workspace_member} → {self.role.name}"


class AuditEvent(models.Model):
    """Immutable log of permission-related and structural changes, workspace-wide."""

    PREFIX = "aud"
    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="audit_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=64)
    resource_type = models.CharField(max_length=64)
    resource_id = models.CharField(max_length=100)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["workspace", "created_at"], name="ae_workspace_created_idx"),
            models.Index(fields=["workspace", "resource_type"], name="ae_workspace_restype_idx"),
        ]

    def __str__(self):
        return f"{self.actor} — {self.action} at {self.created_at}"

