from rest_framework import serializers
from .models import TeamsIntegration, GoogleChatIntegration, IntegrationChannelMapping

class TeamsIntegrationSerializer(serializers.ModelSerializer):

    class Meta:
        model  = TeamsIntegration
        fields = ["id", "webhook_url", "space_name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["is_active", "created_at", "updated_at"]
        extra_kwargs = {"webhook_url": {"required": True}}

    def validate_webhook_url(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
        return value

    def validate_space_name(self, value):
        return value.strip() or "JCN"

    def create(self, validated_data):
        ws = validated_data.pop("workspace")
        instance, _ = TeamsIntegration.objects.update_or_create(
            workspace=ws,
            defaults={**validated_data, "is_active": True},
        )
        return instance


class GoogleChatIntegrationSerializer(serializers.ModelSerializer):

    class Meta:
        model  = GoogleChatIntegration
        fields = ["id", "webhook_url", "space_name", "is_active", "created_at", "updated_at"]
        read_only_fields = ["is_active", "created_at", "updated_at"]
        extra_kwargs = {"webhook_url": {"required": True}}

    def validate_webhook_url(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("This field is required.")
        return value

    def validate_space_name(self, value):
        return value.strip()

    def create(self, validated_data):
        ws = validated_data.pop("workspace")
        instance, _ = GoogleChatIntegration.objects.update_or_create(
            workspace=ws,
            defaults={**validated_data, "is_active": True},
        )
        return instance


class IntegrationChannelMappingSerializer(serializers.ModelSerializer):
    # board_name = serializers.CharField(source="board.name", read_only=True, default=None)

    class Meta:
        model  = IntegrationChannelMapping
        fields = [
            "id", "board", "platform",
            "webhook_url", "notification_format", "enabled_events", "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]
