from django.db import models
from django.conf import settings

from core.fields import UUIDv7Field
from workspaces.models import Workspace, WorkspaceMember


class JobTitle(models.Model):
    PREFIX = "jbt"
    id = UUIDv7Field()
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="job_titles")
    name = models.CharField(max_length=100)
    level = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "name"]
        ordering = ["level", "name"]

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class Department(models.Model):
    PREFIX = "dep"
    id = UUIDv7Field()
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="departments")
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#6366f1")
    identifier = models.CharField(max_length=6)
    parent = models.ForeignKey(
        "self", on_delete=models.SET_NULL, null=True, blank=True, related_name="sub_departments"
    )
    head = models.ForeignKey(
        WorkspaceMember, on_delete=models.SET_NULL, null=True, blank=True, related_name="headed_departments"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_departments"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["workspace", "name"]
        indexes = [
            # fetching top-level or child departments when rendering the department tree
            models.Index(fields=["workspace", "parent"], name="dept_workspace_parent_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class DepartmentMember(models.Model):
    PREFIX = "dpm"
    id = UUIDv7Field()
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="department_memberships")
    # "Headship" is derived from Department.head (single source of truth); the API
    # still exposes a computed `is_head` on each membership.
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["department", "member"]
        indexes = [
            # "which departments is this person in?" — queried on every member profile load
            models.Index(fields=["member"], name="deptmember_member_idx"),
        ]

    def __str__(self):
        return f"{self.member} in {self.department.name}"


class Team(models.Model):
    PREFIX = "tem"
    id = UUIDv7Field()
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="teams")
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name="teams"
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    identifier = models.CharField(max_length=6)
    color = models.CharField(max_length=7, default="#8b5cf6")
    lead = models.ForeignKey(
        WorkspaceMember, on_delete=models.SET_NULL, null=True, blank=True, related_name="led_teams"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_teams"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["workspace", "name"]
        indexes = [
            # "all teams in department X" — primary query when rendering a department page
            models.Index(fields=["workspace", "department"], name="team_workspace_dept_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class TeamMember(models.Model):
    PREFIX = "tmm"
    id = UUIDv7Field()
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="memberships")
    member = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="team_memberships")
    # "Lead" is derived from Team.lead (single source of truth); the API still
    # exposes a computed `is_lead` on each membership.
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["team", "member"]
        indexes = [
            # "which teams is this person in?" — queried on every member profile load
            models.Index(fields=["member"], name="teammember_member_idx"),
        ]

    def __str__(self):
        return f"{self.member} in {self.team.name}"


class OrgProfile(models.Model):
    """Extends WorkspaceMember with org-specific attributes."""

    class EmploymentType(models.TextChoices):
        FULL_TIME = "full_time", "Full-time"
        PART_TIME = "part_time", "Part-time"
        CONTRACTOR = "contractor", "Contractor"
        INTERN = "intern", "Intern"

    PREFIX = "ogp"
    id = UUIDv7Field()
    member = models.OneToOneField(WorkspaceMember, on_delete=models.CASCADE, related_name="org_profile")
    job_title = models.ForeignKey(
        JobTitle, on_delete=models.SET_NULL, null=True, blank=True, related_name="members"
    )
    employment_type = models.CharField(
        max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME
    )
    employee_id = models.CharField(max_length=50, blank=True)
    start_date = models.DateField(null=True, blank=True)
    location = models.CharField(max_length=100, blank=True)
    # Google Maps share link pasted by the employee/HR. work_latitude/longitude are
    # parsed out of it on save (see organization.geo.parse_maps_url) so attendance
    # geofencing (hr.models.Attendance) doesn't need to re-parse a URL per check.
    work_location_url = models.URLField(max_length=500, blank=True)
    work_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    work_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    bio = models.TextField(blank=True)
    # A member can edit their own profile until they save it once, at which
    # point it auto-locks (locked=True) and becomes read-only to them. HR/org
    # managers can always edit any profile and can flip this back to False to
    # let the member update it again — see OrgProfileView/MyOrgProfileView.
    locked = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"OrgProfile({self.member})"


class ReportingLine(models.Model):
    """Direct manager → report relationship. Each person has at most one manager."""
    PREFIX = "rln"
    id = UUIDv7Field()
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="reporting_lines")
    manager = models.ForeignKey(
        WorkspaceMember, on_delete=models.CASCADE, related_name="direct_reports"
    )
    report = models.ForeignKey(
        WorkspaceMember, on_delete=models.CASCADE, related_name="reports_to"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["workspace", "report"]
        indexes = [
            # "get all direct reports of manager X" — core org chart query
            models.Index(fields=["workspace", "manager"], name="repline_workspace_manager_idx"),
        ]

    def __str__(self):
        return f"{self.manager} → {self.report}"
