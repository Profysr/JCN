from django.urls import path
from .views import (
    DepartmentListCreateView,
    DepartmentDetailView,
    DepartmentMemberListCreateView,
    DepartmentMemberDetailView,
    DepartmentChartMembersView,
    UnassignedChartMembersView,
    TeamListCreateView,
    TeamDetailView,
    TeamMemberListCreateView,
    TeamMemberDetailView,
    JobTitleListCreateView,
    JobTitleDetailView,
    OrgProfileView,
    ReportingLineListCreateView,
    ReportingLineDetailView,
    OrgChartView,
    OrgChartReportsView,
    MyOrgProfileView,
    MyOnboardingView,
)

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Departments
    path(f"{_ws}/org/departments/", DepartmentListCreateView.as_view()),
    path(f"{_ws}/org/departments/<str:dept_id>/", DepartmentDetailView.as_view()),
    path(
        f"{_ws}/org/departments/<str:dept_id>/members/",
        DepartmentMemberListCreateView.as_view(),
    ),
    path(
        f"{_ws}/org/departments/<str:dept_id>/members/<str:membership_id>/",
        DepartmentMemberDetailView.as_view(),
    ),
    path(
        f"{_ws}/org/departments/<str:dept_id>/chart/",
        DepartmentChartMembersView.as_view(),
    ),
    # Teams
    path(f"{_ws}/org/teams/", TeamListCreateView.as_view()),
    path(f"{_ws}/org/teams/<str:team_id>/", TeamDetailView.as_view()),
    path(f"{_ws}/org/teams/<str:team_id>/members/", TeamMemberListCreateView.as_view()),
    path(
        f"{_ws}/org/teams/<str:team_id>/members/<str:membership_id>/",
        TeamMemberDetailView.as_view(),
    ),
    # Job Titles
    path(f"{_ws}/org/job-titles/", JobTitleListCreateView.as_view()),
    path(f"{_ws}/org/job-titles/<str:title_id>/", JobTitleDetailView.as_view()),
    # Org Profiles (per member)
    path(f"{_ws}/org/members/<str:member_id>/profile/", OrgProfileView.as_view()),
    # Reporting Lines
    path(f"{_ws}/org/reporting-lines/", ReportingLineListCreateView.as_view()),
    path(
        f"{_ws}/org/reporting-lines/<str:line_id>/", ReportingLineDetailView.as_view()
    ),
    # Org Chart (lazy-loaded tree: root, then expand per-node)
    path(f"{_ws}/org/chart/", OrgChartView.as_view()),
    path(f"{_ws}/org/chart/<str:member_id>/reports/", OrgChartReportsView.as_view()),
    path(f"{_ws}/org/chart/unassigned/", UnassignedChartMembersView.as_view()),

    # Self-service profile
    path(f"{_ws}/org/me/profile/", MyOrgProfileView.as_view()),
    path(f"{_ws}/org/me/onboarding/", MyOnboardingView.as_view()),
]
