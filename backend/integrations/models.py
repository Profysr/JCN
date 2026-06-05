import uuid
from django.db import models


class SlackIntegration(models.Model):
    """
    Stores a workspace's Slack OAuth connection.
    One per workspace — re-connecting replaces the existing record.
    """
    id                        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace                 = models.OneToOneField(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="slack_integration"
    )
    team_id                   = models.CharField(max_length=64)
    team_name                 = models.CharField(max_length=128)
    bot_token                 = models.CharField(max_length=512)   # xoxb-...
    bot_user_id               = models.CharField(max_length=64, blank=True)
    # Incoming webhook (optional — set when user picks a channel during OAuth)
    incoming_webhook_url      = models.CharField(max_length=512, blank=True)
    incoming_webhook_channel  = models.CharField(max_length=128, blank=True)
    is_active                 = models.BooleanField(default=True)
    created_at                = models.DateTimeField(auto_now_add=True)
    updated_at                = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Slack: {self.team_name} → {self.workspace}"


class TeamsIntegration(models.Model):
    """
    Microsoft Teams incoming webhook per workspace.
    The user creates the webhook in Teams and pastes the URL here.
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace    = models.OneToOneField(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="teams_integration"
    )
    webhook_url  = models.CharField(max_length=1024)
    display_name = models.CharField(max_length=128, default="JCN")
    is_active    = models.BooleanField(default=True)
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Teams webhook → {self.workspace}"


class GoogleChatIntegration(models.Model):
    """
    Google Chat incoming webhook per workspace.
    The user creates the webhook in a Google Chat Space and pastes the URL here.
    """
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace   = models.OneToOneField(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="google_chat_integration"
    )
    webhook_url = models.CharField(max_length=1024)
    space_name  = models.CharField(max_length=128, blank=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Google Chat webhook → {self.workspace}"


class IntegrationChannelMapping(models.Model):
    """
    Maps a project (or the whole workspace) to a specific channel/space on a platform.
    Controls which events are sent and in what format.
    """
    class Platform(models.TextChoices):
        SLACK       = "slack",       "Slack"
        TEAMS       = "teams",       "Microsoft Teams"
        GOOGLE_CHAT = "google_chat", "Google Chat"

    class Format(models.TextChoices):
        COMPACT  = "compact",  "Compact"
        DETAILED = "detailed", "Detailed"

    id                   = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace            = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.CASCADE, related_name="integration_mappings"
    )
    # null project = workspace-wide fallback mapping
    project              = models.ForeignKey(
        "projects.Project", on_delete=models.CASCADE, null=True, blank=True, related_name="integration_mappings"
    )
    platform             = models.CharField(max_length=20, choices=Platform.choices)
    # Slack: target channel ID (C-…)
    channel_id           = models.CharField(max_length=128, blank=True)
    channel_name         = models.CharField(max_length=128, blank=True)
    # Teams / Google Chat: per-mapping webhook override (overrides workspace-level webhook)
    webhook_url          = models.CharField(max_length=1024, blank=True)
    notification_format  = models.CharField(max_length=10, choices=Format.choices, default=Format.DETAILED)
    # Which events trigger a notification — empty list = all
    enabled_events       = models.JSONField(default=list)
    is_active            = models.BooleanField(default=True)
    created_at           = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [["workspace", "project", "platform"]]

    def __str__(self):
        proj = self.project.name if self.project else "workspace-wide"
        return f"{self.platform} mapping: {proj}"


class SlackCommandLog(models.Model):
    """Immutable log of every Slack slash command received (for auditing)."""
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace    = models.ForeignKey(
        "workspaces.Workspace", on_delete=models.SET_NULL, null=True, related_name="slack_commands"
    )
    slack_user_id   = models.CharField(max_length=64)
    slack_team_id   = models.CharField(max_length=64)
    command         = models.CharField(max_length=32)
    text            = models.TextField(blank=True)
    response_text   = models.TextField(blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
