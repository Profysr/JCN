from rest_framework import serializers

from accounts.serializers import MiniUserSerializer
from .models import Department, DepartmentMember, JobTitle, OrgProfile, ReportingLine, Team, TeamMember


class JobTitleSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = JobTitle
        fields = ["id", "name", "level", "created_at"]
        read_only_fields = ["id", "created_at"]


class MiniDepartmentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Department
        fields = ["id", "name", "identifier", "color"]


class MiniMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user = MiniUserSerializer(read_only=True)

    class Meta:
        from workspaces.models import WorkspaceMember
        model = WorkspaceMember
        fields = ["id", "user", "role"]


class DepartmentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    head = MiniMemberSerializer(read_only=True)
    head_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    parent = MiniDepartmentSerializer(read_only=True)
    parent_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            "id", "name", "description", "color", "identifier",
            "parent", "parent_id", "head", "head_id",
            "member_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class DepartmentMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    member = MiniMemberSerializer(read_only=True)
    member_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = DepartmentMember
        fields = ["id", "member", "member_id", "is_head", "joined_at"]
        read_only_fields = ["id", "joined_at"]

    def create(self, validated_data):
        validated_data["department"] = self.context["department"]
        return super().create(validated_data)


class MiniTeamSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Team
        fields = ["id", "name", "identifier", "color"]


class TeamSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    lead = MiniMemberSerializer(read_only=True)
    lead_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    department = MiniDepartmentSerializer(read_only=True)
    department_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = Team
        fields = [
            "id", "name", "description", "color", "identifier",
            "department", "department_id", "lead", "lead_id",
            "member_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class TeamMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    member = MiniMemberSerializer(read_only=True)
    member_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = TeamMember
        fields = ["id", "member", "member_id", "is_lead", "joined_at"]
        read_only_fields = ["id", "joined_at"]

    def create(self, validated_data):
        validated_data["team"] = self.context["team"]
        return super().create(validated_data)


class OrgProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    job_title = JobTitleSerializer(read_only=True)
    job_title_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = OrgProfile
        fields = ["id", "job_title", "job_title_id", "employee_id", "start_date", "location", "bio", "updated_at"]
        read_only_fields = ["id", "updated_at"]


class ReportingLineSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    manager = MiniMemberSerializer(read_only=True)
    report = MiniMemberSerializer(read_only=True)
    manager_id = serializers.UUIDField(write_only=True)
    report_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = ReportingLine
        fields = ["id", "manager", "manager_id", "report", "report_id", "created_at"]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        return super().create(validated_data)
