from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from workspaces.models import Workspace, WorkspaceMember
from workspaces.permissions import has_permission, require_app_access
from .events import broadcast_org_event
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
    bulk_relations_context,
)

# ── Shared utilities ──────────────────────────────────────────────────────────
def _get_workspace(workspace_id, user):
    return get_object_or_404(Workspace, id=workspace_id, members__user=user)

def _require_admin(workspace, user):
    if workspace.owner == user:
        return
    if not WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role="admin"
    ).exists():
        raise PermissionDenied("Admin access required.")

def _require_admin_or_self(workspace, requesting_user, target_member):
    if target_member.user == requesting_user:
        return
    _require_admin(workspace, requesting_user)


def _is_admin(workspace, user):
    if workspace.owner == user:
        return True
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role="admin"
    ).exists()


def _require_onboarded(workspace, user):
    """Block non-admin members whose OrgProfile is still in draft status."""
    if _is_admin(workspace, user):
        return
    member = WorkspaceMember.objects.filter(workspace=workspace, user=user).first()
    if not member:
        return
    profile = OrgProfile.objects.filter(member=member).first()
    if profile is None or profile.status == OrgProfile.OnboardingStatus.DRAFT:
        raise PermissionDenied(
            {"code": "profile_incomplete", "detail": "Complete your profile to access the org app."}
        )


def _require_org_access(workspace, user):
    """Require org app access AND completed onboarding. Used by all org read views."""
    require_app_access(user, workspace, "org")
    _require_onboarded(workspace, user)


def _require_profile_view_access(workspace, requesting_user, member):
    """A member can always view their own profile; `has_permission` already treats
    the workspace owner as allowed everything. Otherwise this is gated by the
    `member.view_profile` permission (workspaces/constants.py) — enforced here so a
    role with it turned off (e.g. the default Viewer) can't bypass a hidden frontend
    button by hitting the API directly.
    """
    if member.user == requesting_user:
        return
    if not has_permission(requesting_user, workspace, "workspace", "member.view_profile"):
        raise PermissionDenied("You do not have permission to view member profiles.")


def _get_workspace_with_org_access(workspace_id, user):
    """Fetch the workspace and require org app access + completed onboarding.

    Shorthand for the `_get_workspace` + `_require_org_access` pair repeated across
    every org read view (departments/teams/reporting-lines list+detail, org chart).
    """
    workspace = _get_workspace(workspace_id, user)
    _require_org_access(workspace, user)
    return workspace


def _get_workspace_as_admin(workspace_id, user):
    """Fetch the workspace and require the caller to be a workspace admin.

    Shorthand for the `_get_workspace` + `_require_admin` pair repeated across every
    org write view (create/update/delete departments, teams, reporting lines, etc).
    """
    workspace = _get_workspace(workspace_id, user)
    _require_admin(workspace, user)
    return workspace


def _get_scoped_object(workspace_id, model, obj_id, user, **filters):
    """Fetch the workspace, then a `model` row scoped to it (`model.objects.get(id=obj_id, workspace=workspace)`).

    Used for Department/Team/JobTitle detail lookups where the only scoping rule is
    "belongs to this workspace" — callers add their own permission check afterwards.
    """
    workspace = _get_workspace(workspace_id, user)
    obj = get_object_or_404(model, id=obj_id, workspace=workspace, **filters)
    return workspace, obj


def _finalize_profile_approval(profile):
    """Fire the approval inbox/email notification + workspace broadcast for one profile.

    Shared by `ApproveProfileView` (single) and `BulkApproveProfilesView` (loop).
    """
    from .tasks import notify_member_profile_approved

    notify_member_profile_approved.delay(str(profile.id))
    broadcast_org_event(
        str(profile.member.workspace_id),
        "org.profile.approved",
        {"profile_id": str(profile.id), "member_id": str(profile.member_id)},
    )


# ── Departments ───────────────────────────────────────────────────────────────
class DepartmentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace_with_org_access(workspace_id, request.user)
        depts = (
            Department.objects.filter(workspace=workspace)
            .select_related("head", "head__user", "parent")
            .prefetch_related("memberships")
            .order_by("id")
        )
        return Response(DepartmentSerializer(depts, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        ser = DepartmentSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.department.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)

class DepartmentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    # Not called by the frontend — DepartmentsPage reads a single department out of
    # the useDepartments() list cache instead of fetching it individually. Kept for
    # API completeness (e.g. a future deep-link into one department).
    def get(self, request, workspace_id, dept_id):
        workspace, dept = _get_scoped_object(workspace_id, Department, dept_id, request.user)
        _require_org_access(workspace, request.user)
        return Response(DepartmentSerializer(dept).data)

    def patch(self, request, workspace_id, dept_id):
        workspace, dept = _get_scoped_object(workspace_id, Department, dept_id, request.user)
        _require_admin(workspace, request.user)
        ser = DepartmentSerializer(
            dept,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.department.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, dept_id):
        workspace, dept = _get_scoped_object(workspace_id, Department, dept_id, request.user)
        _require_admin(workspace, request.user)
        dept_id_str = str(dept.id)
        dept.delete()
        broadcast_org_event(str(workspace.id), "org.department.deleted", {"id": dept_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


class DepartmentMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, dept_id):
        workspace, dept = _get_scoped_object(workspace_id, Department, dept_id, request.user)
        _require_org_access(workspace, request.user)
        memberships = dept.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(
            DepartmentMemberSerializer(
                memberships, many=True, context={"department": dept}
            ).data
        )

    def post(self, request, workspace_id, dept_id):
        workspace, dept = _get_scoped_object(workspace_id, Department, dept_id, request.user)
        _require_admin(workspace, request.user)
        ser = DepartmentMemberSerializer(
            data=request.data, context={"request": request, "department": dept}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(
            str(workspace.id), "org.department_member.added",
            {"department_id": str(dept.id), **ser.data},
        )
        return Response(ser.data, status=status.HTTP_201_CREATED)


class DepartmentMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, dept_id, membership_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        dept = get_object_or_404(Department, id=dept_id, workspace=workspace)
        membership = get_object_or_404(
            DepartmentMember, id=membership_id, department=dept
        )
        membership.delete()
        broadcast_org_event(
            str(workspace.id), "org.department_member.removed",
            {"department_id": str(dept.id), "id": str(membership_id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Teams ─────────────────────────────────────────────────────────────────────
class TeamListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace_with_org_access(workspace_id, request.user)
        teams = (
            Team.objects.filter(workspace=workspace)
            .select_related("lead", "lead__user", "department")
            .prefetch_related("memberships")
            .order_by("id")
        )
        return Response(TeamSerializer(teams, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        ser = TeamSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.team.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class TeamDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    # Not called by the frontend — TeamsPage reads a single team out of the
    # useTeams() list cache instead of fetching it individually. Kept for API
    # completeness (e.g. a future deep-link into one team).
    def get(self, request, workspace_id, team_id):
        workspace, team = _get_scoped_object(workspace_id, Team, team_id, request.user)
        _require_org_access(workspace, request.user)
        return Response(TeamSerializer(team).data)

    def patch(self, request, workspace_id, team_id):
        workspace, team = _get_scoped_object(workspace_id, Team, team_id, request.user)
        _require_admin(workspace, request.user)
        ser = TeamSerializer(
            team,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": workspace},
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.team.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, team_id):
        workspace, team = _get_scoped_object(workspace_id, Team, team_id, request.user)
        _require_admin(workspace, request.user)
        team_id_str = str(team.id)
        team.delete()
        broadcast_org_event(str(workspace.id), "org.team.deleted", {"id": team_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, team_id):
        workspace, team = _get_scoped_object(workspace_id, Team, team_id, request.user)
        _require_org_access(workspace, request.user)
        memberships = team.memberships.select_related(
            "member", "member__user"
        ).order_by("id")
        return Response(
            TeamMemberSerializer(memberships, many=True, context={"team": team}).data
        )

    def post(self, request, workspace_id, team_id):
        workspace, team = _get_scoped_object(workspace_id, Team, team_id, request.user)
        _require_admin(workspace, request.user)
        ser = TeamMemberSerializer(
            data=request.data, context={"request": request, "team": team}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(
            str(workspace.id), "org.team_member.added",
            {"team_id": str(team.id), **ser.data},
        )
        return Response(ser.data, status=status.HTTP_201_CREATED)

class TeamMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, team_id, membership_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        team = get_object_or_404(Team, id=team_id, workspace=workspace)
        membership = get_object_or_404(TeamMember, id=membership_id, team=team)
        membership.delete()
        broadcast_org_event(
            str(workspace.id), "org.team_member.removed",
            {"team_id": str(team.id), "id": str(membership_id)},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Job Titles ────────────────────────────────────────────────────────────────
class JobTitleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        titles = JobTitle.objects.filter(workspace=workspace).order_by("level", "name")
        return Response(JobTitleSerializer(titles, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        ser = JobTitleSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        ser.save(workspace=workspace)
        broadcast_org_event(str(workspace.id), "org.job_title.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class JobTitleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_title(self, workspace_id, title_id, user):
        workspace = _get_workspace_as_admin(workspace_id, user)
        return workspace, get_object_or_404(JobTitle, id=title_id, workspace=workspace)

    def patch(self, request, workspace_id, title_id):
        workspace, title = self._get_title(workspace_id, title_id, request.user)
        ser = JobTitleSerializer(title, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.job_title.updated", ser.data)
        return Response(ser.data)

    def delete(self, request, workspace_id, title_id):
        workspace, title = self._get_title(workspace_id, title_id, request.user)
        title_id_str = str(title.id)
        title.delete()
        broadcast_org_event(str(workspace.id), "org.job_title.deleted", {"id": title_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Profiles ──────────────────────────────────────────────────────────────
class OrgProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, member_id):
        workspace = _get_workspace(workspace_id, request.user)

        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        _require_profile_view_access(workspace, request.user, member)
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        return Response(OrgProfileSerializer(profile).data)

    def patch(self, request, workspace_id, member_id):
        workspace = _get_workspace(workspace_id, request.user)

        member = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        _require_admin_or_self(workspace, request.user, member)
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        ser = OrgProfileSerializer(profile, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(
            str(workspace.id), "org.profile.updated",
            {"profile_id": str(profile.id), "member_id": str(member.id)},
        )
        return Response(ser.data)


# ── Reporting Lines ───────────────────────────────────────────────────────────
class ReportingLineListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    # Not called by the frontend — OrgChartView already returns manager_id and
    # reporting_line_id per node, which is the only place the UI needs this data.
    # Kept for API completeness / future consumers.
    def get(self, request, workspace_id):
        workspace = _get_workspace_with_org_access(workspace_id, request.user)
        lines = (
            ReportingLine.objects.filter(workspace=workspace)
            .select_related("manager", "manager__user", "report", "report__user")
            .order_by("id")
        )
        return Response(ReportingLineSerializer(lines, many=True).data)

    def post(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        ser = ReportingLineSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(str(workspace.id), "org.reporting_line.created", ser.data)
        return Response(ser.data, status=status.HTTP_201_CREATED)


class ReportingLineDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, line_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        line = get_object_or_404(ReportingLine, id=line_id, workspace=workspace)
        line_id_str = str(line.id)
        line.delete()
        broadcast_org_event(str(workspace.id), "org.reporting_line.deleted", {"id": line_id_str})
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Org Chart ─────────────────────────────────────────────────────────────────
class OrgChartView(APIView):
    """Tree of all workspace members with dept, team, title, and manager context."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace_with_org_access(workspace_id, request.user)
        members = (
            WorkspaceMember.objects.filter(workspace=workspace)
            .select_related("user")
            .prefetch_related(
                "department_memberships__department",
                "team_memberships__team",
                "org_profile__job_title",
                "reports_to",
            )
            .order_by("id")
        )
        nodes = []
        for m in members:
            profile = getattr(m, "org_profile", None)
            # reports_to is prefetched — read from the cache (don't use .first(),
            # which issues a fresh LIMIT query per member and bypasses the prefetch).
            reports_to = m.reports_to.all()
            manager_line = reports_to[0] if reports_to else None
            nodes.append(
                {
                    "id": str(m.id),
                    "name": m.user.full_name,
                    "email": m.user.email,
                    "avatar": m.user.avatar,
                    "role": m.role,
                    "job_title": (
                        profile.job_title.name
                        if profile and profile.job_title
                        else None
                    ),
                    "manager_id": (
                        str(manager_line.manager_id) if manager_line else None
                    ),
                    "reporting_line_id": (
                        str(manager_line.id) if manager_line else None
                    ),
                    "onboarding_status": (
                        profile.status if profile else None
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


# ── My Profile (self-service onboarding) ─────────────────────────────────────
class MyOrgProfileView(APIView):
    """
    The current user's own org profile.
    GET  — always accessible (needed to render the onboarding wall).
    PATCH — edit own profile fields (draft or submitted state).
    POST  — submit: transitions draft → submitted, lifting the app gate.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_member_and_profile(self, workspace_id, user):
        workspace = _get_workspace(workspace_id, user)
        member = get_object_or_404(
            WorkspaceMember.objects.select_related("user"),
            workspace=workspace, user=user,
        )
        profile, _ = OrgProfile.objects.get_or_create(member=member)
        return workspace, member, profile

    def get(self, request, workspace_id):
        _, _, profile = self._get_member_and_profile(workspace_id, request.user)
        return Response(OrgProfileSerializer(profile).data)

    def patch(self, request, workspace_id):
        workspace, member, profile = self._get_member_and_profile(workspace_id, request.user)
        if profile.status == OrgProfile.OnboardingStatus.APPROVED and not _is_admin(
            profile.member.workspace, request.user
        ):
            raise PermissionDenied("Approved profiles can only be edited by an admin.")
        ser = OrgProfileSerializer(profile, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        broadcast_org_event(
            str(workspace.id), "org.profile.updated",
            {"profile_id": str(profile.id), "member_id": str(member.id)},
        )
        return Response(ser.data)

    def post(self, request, workspace_id):
        """Submit the profile — transitions draft → submitted."""
        _, _, profile = self._get_member_and_profile(workspace_id, request.user)
        if profile.status != OrgProfile.OnboardingStatus.DRAFT:
            return Response(
                {"detail": "Profile has already been submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile.status = OrgProfile.OnboardingStatus.SUBMITTED
        profile.submitted_at = timezone.now()
        profile.save(update_fields=["status", "submitted_at"])
        from .tasks import notify_hr_profile_submitted
        notify_hr_profile_submitted.delay(str(profile.id))
        broadcast_org_event(
            str(profile.member.workspace_id),
            "org.profile.submitted",
            {"profile_id": str(profile.id), "member_id": str(profile.member_id)},
        )
        return Response(OrgProfileSerializer(profile).data)


# ── Pending Profiles (HR review queue) ───────────────────────────────────────
class PendingProfilesView(APIView):
    """Admin-only list of submitted (pending review) profiles."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        profiles = list(
            OrgProfile.objects.filter(
                member__workspace=workspace,
                status=OrgProfile.OnboardingStatus.SUBMITTED,
            )
            .select_related(
                "member", "member__user", "job_title", "approved_by", "approved_by__user"
            )
            .order_by("submitted_at")
        )
        # bulk_relations_context() replaces what would otherwise be 4 queries per
        # profile (departments/teams/manager/direct_reports_count) with 4 total.
        context = bulk_relations_context([p.member for p in profiles])
        return Response(OrgProfileSerializer(profiles, many=True, context=context).data)


# ── Bulk Approve Profiles ─────────────────────────────────────────────────────
class BulkApproveProfilesView(APIView):
    """Admin approves multiple submitted profiles in one request."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)

        profile_ids = request.data.get("profile_ids", [])
        if not profile_ids or not isinstance(profile_ids, list):
            return Response(
                {"detail": "profile_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(profile_ids) > 100:
            return Response(
                {"detail": "Cannot approve more than 100 profiles at once."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approver = get_object_or_404(WorkspaceMember, workspace=workspace, user=request.user)
        now = timezone.now()

        profiles = list(
            OrgProfile.objects.filter(
                id__in=profile_ids,
                member__workspace=workspace,
                status=OrgProfile.OnboardingStatus.SUBMITTED,
            ).select_related("member", "member__user")
        )
        for profile in profiles:
            profile.status = OrgProfile.OnboardingStatus.APPROVED
            profile.approved_at = now
            profile.approved_by = approver

        OrgProfile.objects.bulk_update(profiles, ["status", "approved_at", "approved_by"])
        for profile in profiles:
            _finalize_profile_approval(profile)

        return Response({"approved": len(profiles)})


# ── Approve Profile ───────────────────────────────────────────────────────────
class ApproveProfileView(APIView):
    """Admin approves a submitted profile (submitted → approved)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, profile_id):
        workspace = _get_workspace_as_admin(workspace_id, request.user)
        profile = get_object_or_404(
            OrgProfile, id=profile_id, member__workspace=workspace
        )
        if profile.status != OrgProfile.OnboardingStatus.SUBMITTED:
            return Response(
                {"detail": "Only submitted profiles can be approved."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        approver = get_object_or_404(WorkspaceMember, workspace=workspace, user=request.user)
        profile.status = OrgProfile.OnboardingStatus.APPROVED
        profile.approved_at = timezone.now()
        profile.approved_by = approver
        profile.save(update_fields=["status", "approved_at", "approved_by"])
        _finalize_profile_approval(profile)
        return Response(OrgProfileSerializer(profile).data)
