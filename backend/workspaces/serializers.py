from rest_framework import serializers
from django.utils.text import slugify
from .models import (
    Workspace,
    WorkspaceMember,
    WorkspaceInvite,
    Notification,
    InboxItem,
    NotificationPreference,
    WorkspaceAPIKey,
    Webhook,
    WebhookDelivery,
)
from accounts.serializers import UserSerializer


class WorkspaceSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            "id",
            "name",
            "slug",
            "logo",
            "owner",
            "member_count",
            "my_role",
            "created_at",
        ]
        read_only_fields = ["id", "slug", "owner", "created_at"]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_my_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            member = obj.members.filter(user=request.user).first()
            return member.role if member else None
        return None

    def create(self, validated_data):
        name = validated_data["name"]
        base_slug = slugify(name)
        slug = base_slug
        counter = 1
        while Workspace.objects.filter(slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        validated_data["slug"] = slug
        validated_data["owner"] = self.context["request"].user
        workspace = super().create(validated_data)
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=workspace.owner,
            role=WorkspaceMember.Role.ADMIN,
        )
        return workspace


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = ["id", "user", "joined_at"]


class WorkspaceInviteSerializer(serializers.ModelSerializer):
    invited_by = UserSerializer(read_only=True)

    class Meta:
        model = WorkspaceInvite
        fields = ["id", "token", "email", "role", "invited_by", "status", "created_at"]
        read_only_fields = ["id", "token", "invited_by", "status", "created_at"]

    def validate_email(self, value):
        workspace = self.context["workspace"]
        if WorkspaceMember.objects.filter(
            workspace=workspace, user__email=value
        ).exists():
            raise serializers.ValidationError("This user is already a member.")
        return value

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["invited_by"] = self.context["request"].user
        return super().create(validated_data)


class NotificationSerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = ["id", "actor", "verb", "meta", "read", "created_at"]
        read_only_fields = ["id", "actor", "verb", "meta", "created_at"]


# ── v3.7.0 ────────────────────────────────────────────────────────────────────
class InboxItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InboxItem
        fields = [
            "id",
            "actor_id",
            "actor_name",
            "verb",
            "event_type",
            "resource_name",
            "project_id",
            "project_name",
            "meta",
            "status",
            "snoozed_until",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "actor_id",
            "actor_name",
            "verb",
            "event_type",
            "resource_name",
            "project_id",
            "project_name",
            "meta",
            "created_at",
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "id",
            "event_type",
            "in_app",
            "email",
            "project_id_override",
            "quiet_hours_start",
            "quiet_hours_end",
            "digest_hour",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


# ── v4.5.0 — API Keys ─────────────────────────────────────────────────────────
class WorkspaceAPIKeySerializer(serializers.ModelSerializer):
    """Read serializer — never exposes the hash or full key."""

    class Meta:
        model = WorkspaceAPIKey
        fields = [
            "id",
            "name",
            "key_prefix",
            "scopes",
            "last_used_at",
            "expires_at",
            "created_at",
        ]
        read_only_fields = fields


class APIKeyCreateSerializer(serializers.Serializer):
    """Write serializer — validates the creation payload."""

    name = serializers.CharField(max_length=100)
    scopes = serializers.ListField(child=serializers.CharField(), default=list)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        return value

    def validate_scopes(self, value):
        valid = {c[0] for c in WorkspaceAPIKey.Scope.choices}
        bad = [s for s in value if s not in valid]
        if bad:
            raise serializers.ValidationError(
                f"Invalid scopes: {bad}. Choose from {sorted(valid)}."
            )
        return value or ["read"]


# ── v4.5.0 — Webhooks ─────────────────────────────────────────────────────────
class WebhookSerializer(serializers.ModelSerializer):
    """Read/update serializer — exposes only the secret prefix, never the full secret."""

    secret_prefix = serializers.SerializerMethodField()

    class Meta:
        model = Webhook
        fields = [
            "id",
            "name",
            "url",
            "events",
            "is_active",
            "secret_prefix",
            "created_at",
        ]
        read_only_fields = ["id", "secret_prefix", "created_at"]

    def get_secret_prefix(self, obj):
        return obj.secret[:8] + "…"


class WebhookCreateSerializer(serializers.Serializer):
    """Write serializer — validates the creation payload."""

    name = serializers.CharField(max_length=100)
    url = serializers.URLField()
    events = serializers.ListField(
        child=serializers.CharField(), required=False, default=list
    )

    def validate_name(self, value):
        return value.strip()


class WebhookDeliverySerializer(serializers.ModelSerializer):
    class Meta:
        model = WebhookDelivery
        fields = [
            "id",
            "event",
            "response_code",
            "response_body",
            "duration_ms",
            "success",
            "attempt",
            "created_at",
        ]
        read_only_fields = fields
