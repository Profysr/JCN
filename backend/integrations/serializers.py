from rest_framework import serializers
from .models import (
    SlackIntegration, TeamsIntegration,
    GoogleChatIntegration, IntegrationChannelMapping,
)


class SlackIntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = SlackIntegration
        fields = [
            "id", "team_id", "team_name", "bot_user_id",
            "incoming_webhook_channel", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = fields  # all read-only; write via OAuth flow


class TeamsIntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TeamsIntegration
        fields = ["id", "webhook_url", "display_name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class GoogleChatIntegrationSerializer(serializers.ModelSerializer):
    class Meta:
        model  = GoogleChatIntegration
        fields = ["id", "webhook_url", "space_name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class IntegrationChannelMappingSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True, default=None)

    class Meta:
        model  = IntegrationChannelMapping
        fields = [
            "id", "project", "project_name", "platform",
            "channel_id", "channel_name", "webhook_url",
            "notification_format", "enabled_events", "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "project_name", "created_at"]
