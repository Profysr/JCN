from rest_framework import serializers
from django.utils import timezone
from .models import (
    CustomRole,
    ImportJob,
    InboxItem,
    RoleAssignment,
    Webhook,
    WebhookDelivery,
    Workspace,
    WorkspaceAPIKey,
    WorkspaceInvite,
    WorkspaceMember,
)
from accounts.serializers import MiniUserSerializer


class WorkspaceSerializer(serializers.ModelSerializer):
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
        return len([m for m in obj.members.all() if m.is_active])

    def get_my_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            uid = request.user.id
            for m in obj.members.all():
                if m.user_id == uid and m.is_active:
                    # Resolve role name from RoleAssignment → CustomRole.
                    try:
                        return m.role_assignment.role.name
                    except Exception:
                        pass
        return None

    def validate(self, data):
        request = self.context.get("request")
        if request and not self.instance and not request.user.can_create_workspace:
            raise serializers.ValidationError(
                "Your account cannot create workspaces. Contact the workspace admin to get an invite."
            )
        return data

    def create(self, validated_data):
        from .access import create_system_roles
        from .models import RoleAssignment

        validated_data["owner"] = self.context["request"].user
        workspace = super().create(validated_data)
        member = WorkspaceMember.objects.create(
            workspace=workspace,
            user=workspace.owner,
        )
        # Seed the three built-in roles and assign Admin to the owner.
        system_roles = create_system_roles(workspace)
        RoleAssignment.objects.create(
            workspace_member=member,
            role=system_roles["Admin"],
        )
        return workspace


class WorkspaceMemberSerializer(serializers.ModelSerializer):
    user = MiniUserSerializer(read_only=True)
    role = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = ["user", "joined_at"]

    def get_role(self, obj):
        try:
            return obj.role_assignment.role.name
        except Exception:
            return None


class WorkspaceInviteSerializer(serializers.ModelSerializer):
    invited_by = MiniUserSerializer(read_only=True)

    class Meta:
        model = WorkspaceInvite
        fields = ["id", "token", "email", "role", "invited_by", "status", "created_at"]
        read_only_fields = ["token", "invited_by", "status", "created_at"]

    def validate_email(self, value):
        workspace = self.context["workspace"]
        if WorkspaceMember.objects.filter(
            workspace=workspace, user__email=value, is_active=True
        ).exists():
            raise serializers.ValidationError("This user is already a member.")
        return value

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["invited_by"] = self.context["request"].user
        return super().create(validated_data)


# ── v3.7.0 ────────────────────────────────────────────────────────────────────
class InboxItemSerializer(serializers.ModelSerializer):

    class Meta:
        model = InboxItem
        fields = [
            "id", "actor_id", "actor_name", "verb", "event_type",
            "resource_name", "board_id", "board_name",
            "meta", "status", "snoozed_until", "created_at",
        ]
        read_only_fields = [
            "actor_id", "actor_name", "verb", "event_type",
            "resource_name", "board_id", "board_name",
            "meta", "created_at",
        ]


# ── v4.5.0 — API Keys ─────────────────────────────────────────────────────────
class WorkspaceAPIKeySerializer(serializers.ModelSerializer):
    """Read serializer — never exposes the hash or full key."""

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


# ── vD.1 — Custom RBAC ───────────────────────────────────────────────────────
class CustomRoleSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = CustomRole
        fields = [
            "id", "name", "description", "is_system",
            "app_access", "permissions", "member_count",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "is_system", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return len(obj.assignments.all())

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name cannot be blank.")
        return value

    def validate_app_access(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("app_access must be an object.")
        return {k: bool(v) for k, v in value.items()}

    def validate_permissions(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("permissions must be an object.")
        # Each value must be a dict of {perm_key: bool}
        coerced = {}
        for app_key, app_perms in value.items():
            if not isinstance(app_perms, dict):
                raise serializers.ValidationError(
                    f"permissions['{app_key}'] must be an object."
                )
            coerced[app_key] = {k: bool(v) for k, v in app_perms.items()}
        return coerced

    def validate(self, attrs):
        if self.instance and self.instance.is_system:
            raise serializers.ValidationError(
                "System roles cannot be modified. Duplicate this role to create a custom one."
            )
        return attrs


class RoleAssignmentSerializer(serializers.ModelSerializer):
    """
    Serializer used by the assign-role endpoint.
    Only `role` is writable; everything else is read-only context.
    """

    role = serializers.PrimaryKeyRelatedField(queryset=CustomRole.objects.none())
    role_detail = CustomRoleSerializer(source="role", read_only=True)

    class Meta:
        model = RoleAssignment
        fields = ["id", "role", "role_detail", "assigned_at"]
        read_only_fields = ["id", "assigned_at"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Scope the role choices to the current workspace.
        workspace = self.context.get("workspace")
        if workspace:
            self.fields["role"].queryset = CustomRole.objects.filter(
                workspace=workspace
            )
