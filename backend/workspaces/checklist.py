"""
Per-module getting-started checklist registry.

To add a new module's checklist:
  1. Define a _compute_<module>(workspace) function that returns {key: bool}.
  2. Add it to CHECKLIST_REGISTRY under a module key.

The OnboardingStateView iterates this dict automatically — no other file
changes needed. Module keys here match APP_REGISTRY app keys ("projects",
"people").
"""


def _compute_projects(workspace):
    from projects.models import Board, Task

    return {
        "create_board": Board.objects.filter(workspace=workspace).exists(),
        "add_task": Task.objects.filter(board__workspace=workspace).exists(),
        "assign_task": Task.objects.filter(
            board__workspace=workspace, assignee__isnull=False
        ).exists(),
    }


def _compute_people(workspace):
    from organization.models import Department, Team, ReportingLine
    from hr.models import LeavePolicy, LeaveRequest, Attendance

    return {
        "create_department": Department.objects.filter(workspace=workspace).exists(),
        "create_team": Team.objects.filter(workspace=workspace).exists(),
        "set_reporting_line": ReportingLine.objects.filter(workspace=workspace).exists(),
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
    "people": _compute_people,
}
