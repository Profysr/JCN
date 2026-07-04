from django.urls import path
from .views import (
    LeavePolicyListCreateView,
    LeavePolicyDetailView,
    HolidayListCreateView,
    HolidayDetailView,
    LeaveRequestListCreateView,
    LeaveRequestReviewView,
    LeaveBalanceListView,
    WhosOffView,
    AttendancePolicyView,
    ClockInView,
    ClockOutView,
    AttendanceListView,
    MyAttendanceView,
    AttendanceSummaryView,
    HRDashboardView,
    EmployeeDocumentListCreateView,
    EmployeeDocumentDetailView,
    EmployeeNoteListCreateView,
    EmployeeNoteDetailView,
)

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Leave
    path(f"{_ws}/hr/leave-policies/", LeavePolicyListCreateView.as_view()),
    path(f"{_ws}/hr/leave-policies/<str:policy_id>/", LeavePolicyDetailView.as_view()),
    path(f"{_ws}/hr/holidays/", HolidayListCreateView.as_view()),
    path(f"{_ws}/hr/holidays/<str:holiday_id>/", HolidayDetailView.as_view()),
    path(f"{_ws}/hr/leave-requests/", LeaveRequestListCreateView.as_view()),
    path(f"{_ws}/hr/leave-requests/<str:request_id>/review/", LeaveRequestReviewView.as_view()),
    path(f"{_ws}/hr/leave-balances/", LeaveBalanceListView.as_view()),
    path(f"{_ws}/hr/whos-off/", WhosOffView.as_view()),

    # Attendance
    path(f"{_ws}/hr/attendance-policy/", AttendancePolicyView.as_view()),
    path(f"{_ws}/hr/attendance/clock-in/", ClockInView.as_view()),
    path(f"{_ws}/hr/attendance/clock-out/", ClockOutView.as_view()),
    path(f"{_ws}/hr/attendance/", AttendanceListView.as_view()),
    path(f"{_ws}/hr/attendance/my/", MyAttendanceView.as_view()),
    path(f"{_ws}/hr/attendance/summary/", AttendanceSummaryView.as_view()),

    # Dashboard
    path(f"{_ws}/hr/dashboard/", HRDashboardView.as_view()),

    # Employee Documents
    path(f"{_ws}/hr/members/<str:member_id>/documents/", EmployeeDocumentListCreateView.as_view()),
    path(f"{_ws}/hr/members/<str:member_id>/documents/<str:doc_id>/", EmployeeDocumentDetailView.as_view()),

    # Employee Notes
    path(f"{_ws}/hr/members/<str:member_id>/notes/", EmployeeNoteListCreateView.as_view()),
    path(f"{_ws}/hr/members/<str:member_id>/notes/<str:note_id>/", EmployeeNoteDetailView.as_view()),
]
