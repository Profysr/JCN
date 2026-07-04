"""
Per-module getting-started checklist registry.

To add a new module's checklist:
  1. Define a _compute_<module>(workspace) function that returns {key: bool}.
  2. Add it to CHECKLIST_REGISTRY under a module key.

The OnboardingStateView iterates this dict automatically — no other file
changes needed. Module keys here are independent content groupings, not
APP_REGISTRY app keys — "org" and "hr" stay two separate checklist sections
(matching their own onboarding tasks) even though they're one "people" app
in APP_REGISTRY/access control.
"""


def _compute_projects(workspace):
    from projects.models import Board, Task
    from workspaces.models import WorkspaceMember

    return {
        "create_board": Board.objects.filter(workspace=workspace).exists(),
        "add_task": Task.objects.filter(board__workspace=workspace).exists(),
        "invite_teammate": WorkspaceMember.objects.filter(workspace=workspace).count() > 1,
    }


def _compute_org(workspace):
    from organization.models import Department, Team, ReportingLine

    return {
        "create_department": Department.objects.filter(workspace=workspace).exists(),
        "create_team": Team.objects.filter(workspace=workspace).exists(),
        "set_reporting_line": ReportingLine.objects.filter(workspace=workspace).exists(),
    }


def _compute_hr(workspace):
    from hr.models import LeavePolicy, LeaveRequest, Attendance

    return {
        "create_leave_policy": LeavePolicy.objects.filter(workspace=workspace).exists(),
        "submit_leave_request": LeaveRequest.objects.filter(
            employee__workspace=workspace
        ).exists(),
        "record_attendance": Attendance.objects.filter(
            employee__workspace=workspace
        ).exists(),
    }


# Registry: APP_REGISTRY key → compute function
# Order matters — reflects the natural progression per module.
CHECKLIST_REGISTRY = {
    "projects": _compute_projects,
    "org": _compute_org,
    "hr": _compute_hr,
}
