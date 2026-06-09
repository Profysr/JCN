import uuid
from django.db import models
from workspaces.models import Workspace
from projects.models import Project


class TeamsIntegration(models.Model):
    """
    Microsoft Teams incoming webhook per workspace.
    The user creates the webhook in Teams and pastes the URL here.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        Workspace,
        on_delete=models.CASCADE,
        related_name="teams_integration",
    )
    webhook_url = models.CharField(max_length=1024)
    space_name = models.CharField(max_length=128, default="JCN")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Teams webhook → {self.workspace}"


class GoogleChatIntegration(models.Model):
    """
    Google Chat incoming webhook per workspace.
    The user creates the webhook in a Google Chat Space and pastes the URL here.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.OneToOneField(
        Workspace,
        on_delete=models.CASCADE,
        related_name="google_chat_integration",
    )
    webhook_url = models.CharField(max_length=1024)
    space_name = models.CharField(max_length=128, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Google Chat webhook → {self.workspace}"


class IntegrationChannelMapping(models.Model):
    """
    Maps a project (or the whole workspace) to a specific channel/space on a platform.
    Controls which events are sent and in what format.
    """

    class Platform(models.TextChoices):
        TEAMS = "teams", "Microsoft Teams"
        GOOGLE_CHAT = "google_chat", "Google Chat"

    class Format(models.TextChoices):
        # One-line summary: "Task 'Fix login bug' was completed by John"
        # Good for high-volume channels where you don't want noise.
        COMPACT = "compact", "Compact"

        # Rich card with full context: title, assignee, project, due date, and a link.
        # Better for dedicated notification channels where detail matters.
        DETAILED = "detailed", "Detailed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="integration_mappings",
    )
    # null project = workspace-wide fallback mapping
    project = models.ForeignKey(
        Project,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="integration_mappings",
    )
    platform = models.CharField(max_length=20, choices=Platform.choices)
    channel_name = models.CharField(max_length=128, blank=True)
    webhook_url = models.CharField(max_length=1024, blank=True)
    notification_format = models.CharField(
        max_length=10, choices=Format.choices, default=Format.DETAILED
    )
    # Which events trigger a notification — empty list = all
    enabled_events = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["workspace", "project", "platform"]]

    def __str__(self):
        proj = self.project.name if self.project else "workspace-wide"
        return f"{self.platform} mapping: {proj}"
