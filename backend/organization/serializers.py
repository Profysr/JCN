from rest_framework import serializers

from accounts.serializers import MiniUserSerializer
from workspaces.models import WorkspaceMember
from .models import Department, DepartmentMember, JobTitle, OrgProfile, ReportingLine, Team, TeamMember


class JobTitleSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = JobTitle
        fields = ["id", "name", "level", "created_at"]
        read_only_fields = ["id", "created_at"]


class MiniJobTitleSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = JobTitle
        fields = ["id", "name", "level"]


class MiniDepartmentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = Department
        fields = ["id", "name", "identifier", "color"]


class MiniMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user = MiniUserSerializer(read_only=True)

    class Meta:
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
        return len(obj.memberships.all())

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class DepartmentMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    member = MiniMemberSerializer(read_only=True)
    member_id = serializers.UUIDField(write_only=True)
    is_head = serializers.SerializerMethodField()

    class Meta:
        model = DepartmentMember
        fields = ["id", "member", "member_id", "is_head", "joined_at"]
        read_only_fields = ["id", "joined_at"]

    def get_is_head(self, obj):
        # Derived from Department.head — single source of truth. Prefer the context
        # department (set by list/create views) to avoid a per-row FK fetch.
        dept = self.context.get("department") or obj.department
        return dept.head_id == obj.member_id

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
        return len(obj.memberships.all())

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class TeamMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    member = MiniMemberSerializer(read_only=True)
    member_id = serializers.UUIDField(write_only=True)
    is_lead = serializers.SerializerMethodField()

    class Meta:
        model = TeamMember
        fields = ["id", "member", "member_id", "is_lead", "joined_at"]
        read_only_fields = ["id", "joined_at"]

    def get_is_lead(self, obj):
        # Derived from Team.lead — single source of truth. Prefer the context team
        # (set by list/create views) to avoid a per-row FK fetch.
        team = self.context.get("team") or obj.team
        return team.lead_id == obj.member_id

    def create(self, validated_data):
        validated_data["team"] = self.context["team"]
        return super().create(validated_data)


class OrgProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    member = MiniMemberSerializer(read_only=True)
    job_title = MiniJobTitleSerializer(read_only=True)
    job_title_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    approved_by = MiniMemberSerializer(read_only=True)
    departments = serializers.SerializerMethodField()
    teams = serializers.SerializerMethodField()
    manager = serializers.SerializerMethodField()
    direct_reports_count = serializers.SerializerMethodField()

    class Meta:
        model = OrgProfile
        fields = [
            "id", "member",
            "job_title", "job_title_id", "employment_type",
            "employee_id", "start_date", "location", "bio",
            "status", "submitted_at", "approved_at", "approved_by",
            "departments", "teams", "manager", "direct_reports_count",
            "updated_at",
        ]
        read_only_fields = [
            "id", "member", "status", "submitted_at", "approved_at", "approved_by",
            "updated_at", "departments", "teams", "manager", "direct_reports_count",
        ]

    # Each of the four methods below prefers a bulk-prefetched map passed in via
    # context (see `bulk_relations_context()`) and falls back to a per-object query
    # only when serializing a single profile, where one extra query is cheap. List
    # views MUST supply the context maps — without them this becomes an N+1 (4
    # queries per row) once the list has more than a couple of profiles.

    def get_departments(self, obj):
        bulk = self.context.get("departments_by_member")
        if bulk is not None:
            return bulk.get(obj.member_id, [])
        from .models import DepartmentMember
        memberships = DepartmentMember.objects.filter(member=obj.member).select_related("department")
        return [{"id": str(dm.department.id), "name": dm.department.name, "color": dm.department.color} for dm in memberships]

    def get_teams(self, obj):
        bulk = self.context.get("teams_by_member")
        if bulk is not None:
            return bulk.get(obj.member_id, [])
        from .models import TeamMember
        memberships = TeamMember.objects.filter(member=obj.member).select_related("team")
        return [{"id": str(tm.team.id), "name": tm.team.name, "color": tm.team.color} for tm in memberships]

    def get_manager(self, obj):
        bulk = self.context.get("manager_by_member")
        if bulk is not None:
            return bulk.get(obj.member_id)
        from .models import ReportingLine
        line = ReportingLine.objects.filter(report=obj.member).select_related("manager", "manager__user").first()
        if not line:
            return None
        mgr = line.manager
        return {"id": str(mgr.id), "name": mgr.user.full_name, "email": mgr.user.email}

    def get_direct_reports_count(self, obj):
        bulk = self.context.get("reports_count_by_member")
        if bulk is not None:
            return bulk.get(obj.member_id, 0)
        from .models import ReportingLine
        return ReportingLine.objects.filter(manager=obj.member).count()


def bulk_relations_context(members):
    """Build the departments/teams/manager/direct_reports_count maps `OrgProfileSerializer`
    needs, in 4 queries total instead of 4 per profile. Pass the result as extra
    context to `OrgProfileSerializer(profiles, many=True, context={...})`.
    """
    from collections import defaultdict
    from django.db.models import Count
    from .models import DepartmentMember, TeamMember

    member_ids = [m.id for m in members]

    departments_by_member = defaultdict(list)
    for dm in DepartmentMember.objects.filter(member_id__in=member_ids).select_related("department"):
        departments_by_member[dm.member_id].append(
            {"id": str(dm.department_id), "name": dm.department.name, "color": dm.department.color}
        )

    teams_by_member = defaultdict(list)
    for tm in TeamMember.objects.filter(member_id__in=member_ids).select_related("team"):
        teams_by_member[tm.member_id].append(
            {"id": str(tm.team_id), "name": tm.team.name, "color": tm.team.color}
        )

    manager_by_member = {}
    for line in ReportingLine.objects.filter(report_id__in=member_ids).select_related("manager", "manager__user"):
        mgr = line.manager
        manager_by_member[line.report_id] = {"id": str(mgr.id), "name": mgr.user.full_name, "email": mgr.user.email}

    reports_count_by_member = defaultdict(int)
    for row in (
        ReportingLine.objects.filter(manager_id__in=member_ids)
        .values("manager_id")
        .annotate(count=Count("id"))
    ):
        reports_count_by_member[row["manager_id"]] = row["count"]

    return {
        "departments_by_member": departments_by_member,
        "teams_by_member": teams_by_member,
        "manager_by_member": manager_by_member,
        "reports_count_by_member": reports_count_by_member,
    }


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

    def validate(self, attrs):
        workspace = self.context["workspace"]
        manager_id = attrs["manager_id"]
        report_id = attrs["report_id"]

        if manager_id == report_id:
            raise serializers.ValidationError("A member cannot report to themselves.")

        # Both endpoints must be members of this workspace.
        valid_ids = set(
            WorkspaceMember.objects.filter(
                workspace=workspace, id__in=[manager_id, report_id]
            ).values_list("id", flat=True)
        )
        if manager_id not in valid_ids:
            raise serializers.ValidationError({"manager_id": "Not a member of this workspace."})
        if report_id not in valid_ids:
            raise serializers.ValidationError({"report_id": "Not a member of this workspace."})

        # Adding manager → report closes a cycle iff `report` is already an ancestor
        # of `manager`. Walk up manager's chain (unique_together on report makes it a
        # simple chain); the `seen` guard also breaks any pre-existing bad cycle.
        current = manager_id
        seen = set()
        while current is not None and current not in seen:
            seen.add(current)
            if current == report_id:
                raise serializers.ValidationError("This reporting line would create a cycle.")
            current = (
                ReportingLine.objects.filter(workspace=workspace, report_id=current)
                .values_list("manager_id", flat=True)
                .first()
            )
        return attrs

    def create(self, validated_data):
        validated_data["workspace"] = self.context["workspace"]
        return super().create(validated_data)
