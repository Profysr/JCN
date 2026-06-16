from rest_framework import serializers
from django.utils import timezone
from .models import (
    Workspace,
    WorkspaceMember,
    WorkspaceInvite,
    InboxItem,
    WorkspaceAPIKey,
    Webhook,
    WebhookDelivery,
    ImportJob,
)
from accounts.serializers import MiniUserSerializer
from core.fields import PrefixedUUIDField


class WorkspaceSerializer(serializers.ModelSerializer):
    id = PrefixedUUIDField(read_only=True)
    owner = MiniUserSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            "id", "name", "logo", "owner",
            "member_count", "my_role", "created_at",
        ]
        read_only_fields = ["owner", "created_at"]

    def get_member_count(self, obj):
        return obj.members.count()

    def get_my_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            member = obj.members.filter(user=request.user).first()
            return member.role if member else None
        return None

    def validate(self, data):
        request = self.context.get("request")
        if request and not self.instance and not request.user.can_create_workspace:
            raise serializers.ValidationError(
                "Your account cannot create workspaces. Contact the workspace admin to get an invite."
            )
        return data

    def create(self, validated_data):
        validated_data["owner"] = self.context["request"].user
        workspace = super().create(validated_data)
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=workspace.owner,
            role=WorkspaceMember.Role.ADMIN,
        )
        return workspace


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    id = PrefixedUUIDField(read_only=True)
    user = MiniUserSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = ["user", "joined_at"]


class WorkspaceInviteSerializer(serializers.ModelSerializer):
    id = PrefixedUUIDField(read_only=True)
    invited_by = MiniUserSerializer(read_only=True)

    class Meta:
        model = WorkspaceInvite
        fields = ["id", "token", "email", "role", "invited_by", "status", "created_at"]
        read_only_fields = ["token", "invited_by", "status", "created_at"]

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


# ── v3.7.0 ────────────────────────────────────────────────────────────────────
class InboxItemSerializer(serializers.ModelSerializer):
    id = PrefixedUUIDField(read_only=True)

    class Meta:
        model = InboxItem
        fields = [
            "id", "actor_id", "actor_name", "verb", "event_type",
            "resource_name", "project_id", "project_name",
            "meta", "status", "snoozed_until", "created_at",
        ]
        read_only_fields = [
            "actor_id", "actor_name", "verb", "event_type",
            "resource_name", "project_id", "project_name",
            "meta", "created_at",
        ]


# ── v4.5.0 — API Keys ─────────────────────────────────────────────────────────
class WorkspaceAPIKeySerializer(serializers.ModelSerializer):
    """Read serializer — never exposes the hash or full key."""

    id = PrefixedUUIDField(read_only=True)

    class Meta:
        model = WorkspaceAPIKey
        fields = [
            "id", "name", "key_prefix", "scopes",
            "last_used_at", "expires_at", "created_at",
        ]
        read_only_fields = [
            "name", "key_prefix", "scopes",
            "last_used_at", "expires_at", "created_at",
        ]


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

    id = PrefixedUUIDField(read_only=True)
    secret_prefix = serializers.SerializerMethodField()

    class Meta:
        model = Webhook
        fields = ["id", "name", "url", "events", "is_active", "secret_prefix", "created_at"]
        read_only_fields = ["secret_prefix", "created_at"]

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
    id = PrefixedUUIDField(read_only=True)

    class Meta:
        model = WebhookDelivery
        fields = [
            "id", "event", "response_code", "response_body",
            "duration_ms", "success", "attempt", "created_at",
        ]
        read_only_fields = [
            "event", "response_code", "response_body",
            "duration_ms", "success", "attempt", "created_at",
        ]


# ── v4.6.0 — Import Jobs ──────────────────────────────────────────────────────
class ImportJobSerializer(serializers.ModelSerializer):
    """Read serializer for list and detail views."""

    id = PrefixedUUIDField(read_only=True)
    can_rollback = serializers.SerializerMethodField()

    class Meta:
        model = ImportJob
        fields = [
            "id", "source", "status", "file_name",
            "total_count", "imported_count", "skipped_count",
            "progress_pct", "created_at", "completed_at", "can_rollback",
        ]
        read_only_fields = [
            "source", "status", "file_name",
            "total_count", "imported_count", "skipped_count",
            "progress_pct", "created_at", "completed_at",
        ]

    def get_can_rollback(self, obj):
        if obj.status != ImportJob.Status.COMPLETE or not obj.completed_at:
            return False
        return (timezone.now() - obj.completed_at).total_seconds() < 86400


class ImportJobDetailSerializer(ImportJobSerializer):
    """Extended read serializer that includes preview and mapping data."""

    class Meta(ImportJobSerializer.Meta):
        fields = ImportJobSerializer.Meta.fields + [
            "preview_rows", "field_mapping", "error_log",
        ]
        read_only_fields = fields
