from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from workspaces import access
from workspaces.audit import log_audit
from workspaces.models import WorkspaceMember
from core.events import broadcast
from core.pagination import OrgListPagination
from .models import (
    Department,
    DepartmentMember,
    JobTitle,
    OrgProfile,
    ReportingLine,
    Team,
    TeamMember,
)
from .serializers import (
    DepartmentMemberSerializer,
    DepartmentSerializer,
    JobTitleSerializer,
    OrgProfileSerializer,
    ReportingLineSerializer,
    TeamMemberSerializer,
    TeamSerializer,
)

# ── Access helpers ──────────────────────────────────────────────────────────
# All access resolution lives in workspaces/access.py (see backend/ACCESS.md).

def _read_ws(request, workspace_id):
    """Resolve the workspace for an org READ: requires `org.view` (which implies
    org app access) + a read scope."""
    return access.authorize(request, workspace_id, perm="org.view", scope="read")


def _manage_ws(request, workspace_id):
    """Resolve the workspace for an org STRUCTURAL mutation: `org.manage` + write."""
    return access.authorize(request, workspace_id, perm="org.manage", scope="write")


def _require_profile_view_access(workspace, requesting_user, member):
    """A member can always view their own profile; otherwise the workspace-level
    `member.view_profile` permission is required. Not tied to org app access —
    this endpoint is also consumed workspace-wide (member directory, HR).
    """
    if member.user == requesting_user:
        return
    if not access.has_perm(requesting_user, workspace, "member.view_profile"):
        raise PermissionDenied("You do not have permission to view member profiles.")


# ── Departments ───────────────────────────────────────────────────────────────
class DepartmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]
    pagination_class = OrgListPagination

    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        depts = (
            Department.objects.filter(workspace=workspace)
            .select_related("head", "head__user", "parent")
            .prefetch_related("memberships__member")
            .order_by("id")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(depts, request, view=self)
        return paginator.get_paginated_response(DepartmentSerializer(page, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id)
        ser = DepartmentSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        dept = ser.save()
        log_audit(request.user, workspace, "department.created", "Department", dept.id, after=ser.data)
        broadcast(str(workspace.id), "org.department.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)

class DepartmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    # Not called by the frontend — DepartmentsPage reads a single department out of
    # the useDepartments() list cache instead of fetching it individually. Kept for
    # API completeness (e.g. a future deep-link into one department).
    def get(self, request, workspace_id, dept_id):
        workspace = _read_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        return Response(DepartmentSerializer(dept).data)

    def patch(self, request, workspace_id, dept_id):
        workspace = _manage_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        before = DepartmentSerializer(dept).data
        ser = DepartmentSerializer(
            dept,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        log_audit(request.user, workspace, "department.updated", "Department", dept.id, before=before, after=ser.data)
        broadcast(str(workspace.id), "org.department.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, dept_id):
        workspace = _manage_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        dept_id_str = str(dept.id)
        before = DepartmentSerializer(dept).data
        dept.delete()
        log_audit(request.user, workspace, "department.deleted", "Department", dept_id_str, before=before)
        broadcast(str(workspace.id), "org.department.deleted", {"id": dept_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


class DepartmentMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, dept_id):
        workspace = _read_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        memberships = dept.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(
            DepartmentMemberSerializer(
                memberships, many=True, context={"department": dept}
            ).data
        )

    def post(self, request, workspace_id, dept_id):
        workspace = _manage_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        ser = DepartmentMemberSerializer(
            data=request.data, context={"request": request, "department": dept}
        )
        ser.is_valid(raise_exception=True)
        membership = ser.save()
        log_audit(
            request.user, workspace, "department_member.added", "Department", dept.id,
            after={"member_id": str(membership.member_id)},
        )
        broadcast(
            str(workspace.id), "org.department_member.added",
            {"department_id": str(dept.id), **ser.data},
        )
        return Response(ser.data, status=status.HTTP_201_CREATED)


class DepartmentMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def delete(self, request, workspace_id, dept_id, membership_id):
        workspace = _manage_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        membership = get_object_or_404(
            DepartmentMember, id=membership_id, department=dept
        )
        member_id = membership.member_id
        membership.delete()
        if dept.head_id == membership.member_id:
            dept.head = None
            dept.save(update_fields=["head"])
        log_audit(
            request.user, workspace, "department_member.removed", "Department", dept.id,
            before={"member_id": str(member_id)},
        )
        broadcast(
            str(workspace.id), "org.department_member.removed",
            {"department_id": str(dept.id), "id": str(membership_id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Teams ─────────────────────────────────────────────────────────────────────
class TeamListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]
    pagination_class = OrgListPagination

    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        teams = (
            Team.objects.filter(workspace=workspace)
            .select_related("lead", "lead__user", "department")
            .prefetch_related("memberships__member")
            .order_by("id")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(teams, request, view=self)
        return paginator.get_paginated_response(TeamSerializer(page, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id)
        ser = TeamSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        team = ser.save()
        log_audit(request.user, workspace, "team.created", "Team", team.id, after=ser.data)
        broadcast(str(workspace.id), "org.team.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    #! Not called by the frontend — TeamsPage reads a single team out of the useTeams() list cache instead of fetching it individually. Kept for API completeness (e.g. a future deep-link into one team).
    def get(self, request, workspace_id, team_id):
        workspace = _read_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        return Response(TeamSerializer(team).data)

    def patch(self, request, workspace_id, team_id):
        workspace = _manage_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        before = TeamSerializer(team).data
        ser = TeamSerializer(
            team,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        log_audit(request.user, workspace, "team.updated", "Team", team.id, before=before, after=ser.data)
        broadcast(str(workspace.id), "org.team.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, team_id):
        workspace = _manage_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        team_id_str = str(team.id)
        before = TeamSerializer(team).data
        team.delete()
        log_audit(request.user, workspace, "team.deleted", "Team", team_id_str, before=before)
        broadcast(str(workspace.id), "org.team.deleted", {"id": team_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, team_id):
        workspace = _read_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        memberships = team.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(
            TeamMemberSerializer(memberships, many=True, context={"team": team}).data
        )

    def post(self, request, workspace_id, team_id):
        workspace = _manage_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        ser = TeamMemberSerializer(
            data=request.data, context={"request": request, "team": team}
        )
        ser.is_valid(raise_exception=True)
        membership = ser.save()
        log_audit(
            request.user, workspace, "team_member.added", "Team", team.id,
            after={"member_id": str(membership.member_id)},
        )
        broadcast(
            str(workspace.id), "org.team_member.added",
            {"team_id": str(team.id), **ser.data},
        )
        return Response(ser.data, status=status.HTTP_201_CREATED)

class TeamMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def delete(self, request, workspace_id, team_id, membership_id):
        workspace = _manage_ws(request, workspace_id)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        membership = get_object_or_404(TeamMember, id=membership_id, team=team)
        member_id = membership.member_id
        membership.delete()
        if team.lead_id == membership.member_id:
            team.lead = None
            team.save(update_fields=["lead"])
        log_audit(
            request.user, workspace, "team_member.removed", "Team", team.id,
            before={"member_id": str(member_id)},
        )
        broadcast(
            str(workspace.id), "org.team_member.removed",
            {"team_id": str(team.id), "id": str(membership_id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Job Titles ────────────────────────────────────────────────────────────────
class JobTitleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        titles = JobTitle.objects.filter(workspace=workspace).order_by("level", "name")
        return Response(JobTitleSerializer(titles, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id)
        ser = JobTitleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(workspace=workspace)
        broadcast(str(workspace.id), "org.job_title.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class JobTitleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def patch(self, request, workspace_id, title_id):
        workspace = _manage_ws(request, workspace_id)
        title = get_object_or_404(JobTitle, id=title_id, workspace=workspace)
        ser = JobTitleSerializer(title, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast(str(workspace.id), "org.job_title.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, title_id):
        workspace = _manage_ws(request, workspace_id)
        title = get_object_or_404(JobTitle, id=title_id, workspace=workspace)
        title_id_str = str(title.id)
        title.delete()
        broadcast(str(workspace.id), "org.job_title.deleted", {"id": title_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Profiles ──────────────────────────────────────────────────────────────
def _apply_profile_patch(profile, data, *, is_manager):
    """Shared PATCH body for OrgProfileView and MyOrgProfileView.

    A member fills their profile once; a successful non-manager save then
    auto-locks it (read-only until HR unlocks it again). Managers/HR can
    always edit any field, including toggling `locked` itself — non-managers
    never can, so `locked` is stripped from their request body up front.
    """
    if not is_manager:
        if profile.locked:
            raise PermissionDenied("This profile is locked. Ask HR to unlock it before editing.")
        data = {k: v for k, v in data.items() if k != "locked"}

    ser = OrgProfileSerializer(profile, data=data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()

    if not is_manager:
        profile.locked = True
        profile.save(update_fields=["locked"])

    return profile


class OrgProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, member_id):
        workspace = access.authorize(request, workspace_id, scope="read")
        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        _require_profile_view_access(workspace, request.user, member)
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        return Response(OrgProfileSerializer(profile).data)

    def patch(self, request, workspace_id, member_id):
        workspace = access.authorize(request, workspace_id, scope="write")
        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)

        is_self = member.user == request.user
        is_manager = access.has_perm(request.user, workspace, "org.manage")
        if not is_self and not is_manager:
            raise PermissionDenied("You do not have permission to edit this profile.")

        profile, _ = OrgProfile.objects.get_or_create(member=member)
        profile = _apply_profile_patch(profile, request.data, is_manager=is_manager)
        broadcast(
            str(workspace.id), "org.profile.updated",
            {"profile_id": str(profile.id), "member_id": str(member.id)},
        )
        return Response(OrgProfileSerializer(profile).data)


# ── Reporting Lines ───────────────────────────────────────────────────────────
class ReportingLineListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]
    pagination_class = OrgListPagination

    #! Not called by the frontend — OrgChartView already returns manager_id and reporting_line_id per node, which is the only place the UI needs this data. Kept for API completeness / future consumers.
    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        lines = (
            ReportingLine.objects.filter(workspace=workspace)
            .select_related("manager", "manager__user", "report", "report__user")
            .order_by("id")
        )
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(lines, request, view=self)
        return paginator.get_paginated_response(ReportingLineSerializer(page, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id)
        ser = ReportingLineSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)

        # A report can only have one manager (unique_together on workspace+report). Reassigning someone's manager is a replace, not a rejected duplicate — update the existing row in place instead of inserting a second one.
        existing = ReportingLine.objects.filter(
            workspace=workspace, report_id=ser.validated_data["report_id"]
        ).first()
        if existing:
            existing.manager_id = ser.validated_data["manager_id"]
            existing.save(update_fields=["manager_id"])
            out = ReportingLineSerializer(existing).data
            log_audit(request.user, workspace, "reporting_line.updated", "ReportingLine", existing.id, after=out)
            broadcast(str(workspace.id), "org.reporting_line.updated", out)
            return Response(out, status=status.HTTP_200_OK)

        line = ser.save()
        log_audit(request.user, workspace, "reporting_line.created", "ReportingLine", line.id, after=ser.data)
        broadcast(str(workspace.id), "org.reporting_line.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class ReportingLineDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def delete(self, request, workspace_id, line_id):
        workspace = _manage_ws(request, workspace_id)
        line = get_object_or_404(ReportingLine, id=line_id, workspace=workspace)
        line_id_str = str(line.id)
        before = {"manager_id": str(line.manager_id), "report_id": str(line.report_id)}
        line.delete()
        log_audit(request.user, workspace, "reporting_line.deleted", "ReportingLine", line_id_str, before=before)
        broadcast(str(workspace.id), "org.reporting_line.deleted", {"id": line_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Chart ─────────────────────────────────────────────────────────────────
def _chart_member_base_qs(workspace):
    """Base queryset for rendering members as org-chart nodes — shared by the root/expand/department-chart views so they stay in lockstep on shape and query cost. Callers still need to `.filter(...)` and annotate `reports_count`.
    """
    return (
        WorkspaceMember.objects.filter(workspace=workspace, is_active=True)
        .select_related("user", "role_assignment__role")
        .prefetch_related(
            "department_memberships__department",
            "team_memberships__team",
            "org_profile__job_title",
            "reports_to",
        )
        .annotate(
            reports_count=Count(
                "direct_reports",
                filter=Q(direct_reports__report__is_active=True),
                distinct=True,
            )
        )
    )


def _serialize_chart_node(m):
    profile = getattr(m, "org_profile", None)
    reports_to = m.reports_to.all()
    manager_line = reports_to[0] if reports_to else None
    role_assignment = getattr(m, "role_assignment", None)
    return {
        "id": str(m.id),
        "name": m.user.full_name,
        "email": m.user.email,
        "avatar": m.user.avatar,
        "role": role_assignment.role.name if role_assignment else None,
        "job_title": (
            profile.job_title.name if profile and profile.job_title else None
        ),
        "manager_id": str(manager_line.manager_id) if manager_line else None,
        "reporting_line_id": str(manager_line.id) if manager_line else None,
        "departments": [
            {"id": str(dm.department_id), "name": dm.department.name}
            for dm in m.department_memberships.all()
        ],
        "teams": [
            {"id": str(tm.team_id), "name": tm.team.name}
            for tm in m.team_memberships.all()
        ],
        "direct_reports_count": m.reports_count,
        "has_reports": m.reports_count > 0,
    }


class OrgChartView(APIView):
    """Root of the org chart tree: members with no manager (the top of each reporting line), lazily expanded via OrgChartReportsView. Workspaces with no reporting lines configured yet have no way to tell "top" from "everyone
    else", so every member is returned as a root — the tree is flat until reporting lines are added.
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        members = (
            _chart_member_base_qs(workspace)
            .filter(reports_to__isnull=True)
            .order_by("id")
        )
        return Response({"nodes": [_serialize_chart_node(m) for m in members]})


class OrgChartReportsView(APIView):
    """Direct reports (one level) of a given member — the expand-on-click step."""

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, member_id):
        workspace = _read_ws(request, workspace_id)
        get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        members = (
            _chart_member_base_qs(workspace)
            .filter(reports_to__manager_id=member_id)
            .order_by("id")
        )
        return Response({"nodes": [_serialize_chart_node(m) for m in members]})


class DepartmentChartMembersView(APIView):
    """Members of one department as chart nodes — backs the "By Department" lazy
    view (each department card expands into its members on click).
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, dept_id):
        workspace = _read_ws(request, workspace_id)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        members = (
            _chart_member_base_qs(workspace)
            .filter(department_memberships__department=dept)
            .order_by("id")
        )
        return Response({"nodes": [_serialize_chart_node(m) for m in members]})


class UnassignedChartMembersView(APIView):
    """Members with no department — the "By Department" view's overflow bucket."""

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _read_ws(request, workspace_id)
        members = (
            _chart_member_base_qs(workspace)
            .filter(department_memberships__isnull=True)
            .order_by("id")
        )
        return Response({"nodes": [_serialize_chart_node(m) for m in members]})


# ── My Profile (self-service) ─────────────────────────────────────────────────
class MyOrgProfileView(APIView):
    """
    The current user's own org profile.
    GET   — always accessible; membership + a read scope is enough (not gated
            by `org.view`, since a member needs this before they've set up
            their profile at all).
    PATCH — edit own profile fields. Auto-locks on save (see
            _apply_profile_patch) unless the caller is a workspace admin.
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def _get_member_and_profile(self, workspace, user):
        member = get_object_or_404(
            WorkspaceMember.objects.select_related("user"),
            workspace=workspace, user=user,
        )
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        return member, profile

    def get(self, request, workspace_id):
        workspace = access.authorize(request, workspace_id, scope="read")
        _, profile = self._get_member_and_profile(workspace, request.user)
        return Response(OrgProfileSerializer(profile).data)

    def patch(self, request, workspace_id):
        workspace = access.authorize(request, workspace_id, scope="write")
        member, profile = self._get_member_and_profile(workspace, request.user)
        is_admin = access.is_workspace_admin(request.user, workspace)
        profile = _apply_profile_patch(profile, request.data, is_manager=is_admin)
        broadcast(
            str(workspace.id), "org.profile.updated",
            {"profile_id": str(profile.id), "member_id": str(member.id)},
        )
        return Response(OrgProfileSerializer(profile).data)
