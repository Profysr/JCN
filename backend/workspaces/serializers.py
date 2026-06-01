from rest_framework import serializers
from django.utils.text import slugify
from .models import Workspace, WorkspaceMember, WorkspaceInvite, Notification
from accounts.serializers import UserSerializer

class WorkspaceSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = ["id", "name", "slug", "logo", "owner", "member_count", "my_role", "created_at"]
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
        if WorkspaceMember.objects.filter(workspace=workspace, user__email=value).exists():
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
