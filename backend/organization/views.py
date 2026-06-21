from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from core.modules import MODULE_REGISTRY
from workspaces.models import Workspace, WorkspaceMember, WorkspaceModule
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

# ── Shared utilities ──────────────────────────────────────────────────────────
def _get_workspace(workspace_id, user):
    return get_object_or_404(Workspace, id=workspace_id, members__user=user)


def _require_module(workspace, module_key):
    module_def = MODULE_REGISTRY.get(module_key, {})
    if module_def.get("always_on"):
        return
    if not WorkspaceModule.objects.filter(
        workspace=workspace, module_key=module_key, is_enabled=True
    ).exists():
        name = module_def.get("name", module_key)
        raise PermissionDenied(
            {
                "detail": f"Module '{name}' is not enabled for this workspace.",
                "module": module_key,
            }
        )


def _require_admin(workspace, user):
    if workspace.owner == user:
        return
    if not WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role="admin"
    ).exists():
        raise PermissionDenied("Admin access required.")


# ── Departments ───────────────────────────────────────────────────────────────


class DepartmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        depts = (
            Department.objects.filter(workspace=workspace)
            .select_related("head", "head__user", "parent")
            .prefetch_related("memberships")
            .order_by("id")
        )
        return Response(DepartmentSerializer(depts, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        ser = DepartmentSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class DepartmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_id, dept_id, user):
        workspace = _get_workspace(workspace_id, user)
        _require_module(workspace, "org_structure")
        return workspace, get_object_or_404(Department, id=dept_id, workspace=workspace)

    def get(self, request, workspace_id, dept_id):
        _, dept = self._get(workspace_id, dept_id, request.user)
        return Response(DepartmentSerializer(dept).data)

    def patch(self, request, workspace_id, dept_id):
        workspace, dept = self._get(workspace_id, dept_id, request.user)
        _require_admin(workspace, request.user)
        ser = DepartmentSerializer(
            dept,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, workspace_id, dept_id):
        workspace, dept = self._get(workspace_id, dept_id, request.user)
        _require_admin(workspace, request.user)
        dept.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DepartmentMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_dept(self, workspace_id, dept_id, user):
        workspace = _get_workspace(workspace_id, user)
        _require_module(workspace, "org_structure")
        return workspace, get_object_or_404(Department, id=dept_id, workspace=workspace)

    def get(self, request, workspace_id, dept_id):
        _, dept = self._get_dept(workspace_id, dept_id, request.user)
        memberships = dept.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(DepartmentMemberSerializer(memberships, many=True).data)

    def post(self, request, workspace_id, dept_id):
        workspace, dept = self._get_dept(workspace_id, dept_id, request.user)
        _require_admin(workspace, request.user)
        ser = DepartmentMemberSerializer(
            data=request.data, context={"request": request, "department": dept}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class DepartmentMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, dept_id, membership_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        membership = get_object_or_404(
            DepartmentMember, id=membership_id, department=dept
        )
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Teams ─────────────────────────────────────────────────────────────────────


class TeamListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        teams = (
            Team.objects.filter(workspace=workspace)
            .select_related("lead", "lead__user", "department")
            .prefetch_related("memberships")
            .order_by("id")
        )
        return Response(TeamSerializer(teams, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        ser = TeamSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_id, team_id, user):
        workspace = _get_workspace(workspace_id, user)
        _require_module(workspace, "org_structure")
        return workspace, get_object_or_404(Team, id=team_id, workspace=workspace)

    def get(self, request, workspace_id, team_id):
        _, team = self._get(workspace_id, team_id, request.user)
        return Response(TeamSerializer(team).data)

    def patch(self, request, workspace_id, team_id):
        workspace, team = self._get(workspace_id, team_id, request.user)
        _require_admin(workspace, request.user)
        ser = TeamSerializer(
            team,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, workspace_id, team_id):
        workspace, team = self._get(workspace_id, team_id, request.user)
        _require_admin(workspace, request.user)
        team.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_team(self, workspace_id, team_id, user):
        workspace = _get_workspace(workspace_id, user)
        _require_module(workspace, "org_structure")
        return workspace, get_object_or_404(Team, id=team_id, workspace=workspace)

    def get(self, request, workspace_id, team_id):
        _, team = self._get_team(workspace_id, team_id, request.user)
        memberships = team.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(TeamMemberSerializer(memberships, many=True).data)

    def post(self, request, workspace_id, team_id):
        workspace, team = self._get_team(workspace_id, team_id, request.user)
        _require_admin(workspace, request.user)
        ser = TeamMemberSerializer(
            data=request.data, context={"request": request, "team": team}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class TeamMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, team_id, membership_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        membership = get_object_or_404(TeamMember, id=membership_id, team=team)
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Job Titles ────────────────────────────────────────────────────────────────


class JobTitleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        titles = JobTitle.objects.filter(workspace=workspace).order_by("level", "name")
        return Response(JobTitleSerializer(titles, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        ser = JobTitleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(workspace=workspace)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class JobTitleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, title_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        title = get_object_or_404(JobTitle, id=title_id, workspace=workspace)
        ser = JobTitleSerializer(title, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, workspace_id, title_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        title = get_object_or_404(JobTitle, id=title_id, workspace=workspace)
        title.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Profiles ──────────────────────────────────────────────────────────────


class OrgProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, member_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        return Response(OrgProfileSerializer(profile).data)

    def patch(self, request, workspace_id, member_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        is_admin = (
            workspace.owner == request.user
            or WorkspaceMember.objects.filter(
                workspace=workspace, user=request.user, role="admin"
            ).exists()
        )
        if not is_admin and member.user != request.user:
            raise PermissionDenied("You can only edit your own org profile.")
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        ser = OrgProfileSerializer(profile, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


# ── Reporting Lines ───────────────────────────────────────────────────────────


class ReportingLineListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        lines = (
            ReportingLine.objects.filter(workspace=workspace)
            .select_related("manager", "manager__user", "report", "report__user")
            .order_by("id")
        )
        return Response(ReportingLineSerializer(lines, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        ser = ReportingLineSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data, status=status.HTTP_201_CREATED)


class ReportingLineDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, line_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        _require_admin(workspace, request.user)
        line = get_object_or_404(ReportingLine, id=line_id, workspace=workspace)
        line.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Chart ─────────────────────────────────────────────────────────────────


class OrgChartView(APIView):
    """Tree of all workspace members with dept, team, title, and manager context."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        _require_module(workspace, "org_structure")
        members = (
            WorkspaceMember.objects.filter(workspace=workspace)
            .select_related("user")
            .prefetch_related(
                "department_memberships__department",
                "team_memberships__team",
                "org_profile__job_title",
                "reports_to__manager__user",
            )
        )
        nodes = []
        for m in members:
            profile = getattr(m, "org_profile", None)
            manager_line = m.reports_to.first()
            nodes.append(
                {
                    "id": str(m.id),
                    "name": m.user.full_name,
                    "email": m.user.email,
                    "avatar": m.user.avatar.url if m.user.avatar else None,
                    "role": m.role,
                    "job_title": (
                        profile.job_title.name
                        if profile and profile.job_title
                        else None
                    ),
                    "manager_id": (
                        str(manager_line.manager_id) if manager_line else None
                    ),
                    "departments": [
                        {"id": str(dm.department_id), "name": dm.department.name}
                        for dm in m.department_memberships.all()
                    ],
                    "teams": [
                        {"id": str(tm.team_id), "name": tm.team.name}
                        for tm in m.team_memberships.all()
                    ],
                }
            )
        return Response({"nodes": nodes})
