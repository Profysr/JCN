import math
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db import transaction
from django.db.models import Count

from workspaces.models import WorkspaceMember
from workspaces import access
from core.events import broadcast, notify
from .models import Attendance, AttendancePolicy, EmployeeDocument, EmployeeNote, Holiday, LeaveBalance, LeavePolicy, LeaveRequest
from .serializers import (
    AttendancePolicySerializer,
    AttendanceSerializer,
    EmployeeDocumentSerializer,
    EmployeeNoteSerializer,
    HolidaySerializer,
    LeaveBalanceSerializer,
    LeavePolicySerializer,
    LeaveRequestReviewSerializer,
    LeaveRequestSerializer,
    MiniMemberSerializer,
)

# Employee document upload constraints (basic first-line validation; content_type is
# client-supplied so it's a guard, not a guarantee).
ALLOWED_DOC_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_DOC_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

# ── Shared utilities ──────────────────────────────────────────────────────────

def _get_member(workspace, user):
    return get_object_or_404(WorkspaceMember, workspace=workspace, user=user, is_active=True)


# All access resolution lives in workspaces/access.py (see backend/ACCESS.md).
# These thin helpers name the common HR gate combinations.

def _view_ws(request, workspace_id):
    """HR read — requires hr.view (implies HR app access) + a read scope."""
    return access.authorize(request, workspace_id, perm="hr.view", scope="read")


def _self_ws(request, workspace_id):
    """Employee self-service (submit leave, clock in/out) — any People & HR-enabled member."""
    return access.authorize(request, workspace_id, app="people", scope="write")


def _manage_ws(request, workspace_id, perm, scope="write"):
    """HR management action gated on a specific fine-grained permission."""
    return access.authorize(request, workspace_id, perm=perm, scope=scope)


def _holiday_dates_in_range(workspace, start, end):
    """Expand Holiday rows (including recurring ones) into concrete dates within
    [start, end]. Recurring holidays are stored once and matched by month/day in
    any year they fall within the range.
    """
    dates = set()
    for h in Holiday.objects.filter(workspace=workspace):
        if h.is_recurring:
            for year in range(start.year, end.year + 1):
                try:
                    occ = h.date.replace(year=year)
                except ValueError:
                    continue  # e.g. a Feb 29 holiday in a non-leap year
                if start <= occ <= end:
                    dates.add(occ)
        elif start <= h.date <= end:
            dates.add(h.date)
    return dates


def _leave_days(workspace, start, end, start_day_part=LeaveRequest.DayPart.FULL, end_day_part=LeaveRequest.DayPart.FULL):
    """Business days in an inclusive date range, excluding weekends and workspace
    holidays, with a half-day (0.5) adjustment on the start/end date when
    requested. Returns a Decimal.
    """
    holidays = _holiday_dates_in_range(workspace, start, end)
    total = Decimal("0")
    for i in range((end - start).days + 1):
        d = start + timedelta(days=i)
        if d.weekday() >= 5 or d in holidays:
            continue
        is_half = (
            (d == start and start_day_part != LeaveRequest.DayPart.FULL)
            or (d == end and end_day_part != LeaveRequest.DayPart.FULL)
        )
        total += Decimal("0.5") if is_half else Decimal("1")
    return total


def _parse_date_window(request, default_lookback_days=31, max_span_days=366):
    """Resolve ?date_from / ?date_to into a bounded inclusive window.

    Attendance is one row per employee per day, so an unfiltered list grows without
    bound. The UI always queries by week/month, so rather than offset-pagination
    (which would truncate a partial week) we bound the window: default to the last
    `default_lookback_days`, and hard-cap the span at `max_span_days`.
    """
    today = timezone.localdate()
    raw_from = request.query_params.get("date_from")
    raw_to = request.query_params.get("date_to")
    try:
        date_to = date.fromisoformat(raw_to) if raw_to else today
        date_from = (
            date.fromisoformat(raw_from) if raw_from
            else date_to - timedelta(days=default_lookback_days)
        )
    except ValueError:
        raise ValidationError({"non_field_errors": "Dates must be ISO format (YYYY-MM-DD)."})
    if date_to < date_from:
        raise ValidationError({"date_to": "date_to must be on or after date_from."})
    if (date_to - date_from).days > max_span_days:
        raise ValidationError({"non_field_errors": f"Date range too large (max {max_span_days} days)."})
    return date_from, date_to


def _client_ip(request):
    """Server-side IP capture — never trust a client-supplied IP field.
    X-Forwarded-For's first hop is the original client when behind a proxy/LB.
    """
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _distance_meters(lat1, lng1, lat2, lng2):
    """Haversine distance in meters between two lat/lng points."""
    r = 6371000
    p1, p2 = math.radians(float(lat1)), math.radians(float(lat2))
    dp = math.radians(float(lat2) - float(lat1))
    dl = math.radians(float(lng2) - float(lng1))
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _check_geofence(workspace, member, latitude, longitude):
    """Return True if the submitted coords fall outside the configured geofence.
    Returns False (not flagged) if geofencing is off or coords are missing on
    either side — this never blocks a clock-in/out, only flags it for HR."""
    if latitude is None or longitude is None:
        return False
    policy = _get_attendance_policy(workspace)
    if not policy.geofence_enabled:
        return False
    org_profile = getattr(member, "org_profile", None)
    if not org_profile or org_profile.work_latitude is None or org_profile.work_longitude is None:
        return False
    distance = _distance_meters(latitude, longitude, org_profile.work_latitude, org_profile.work_longitude)
    return distance > policy.geofence_radius_meters


def _notify_geofence_breach(workspace, member):
    for admin_member in access.workspace_admins(workspace):
        if admin_member.user != member.user:
            notify(
                recipient=admin_member.user,
                actor=member.user,
                verb="attendance.geofence_flagged",
                workspace=workspace,
                task=None,
            )


# ── Leave Policies ─────────────────────────────────────────────────────────────

class LeavePolicyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        policies = LeavePolicy.objects.filter(workspace=workspace)
        return Response(LeavePolicySerializer(policies, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave")
        serializer = LeavePolicySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LeavePolicyDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def _get_policy(self, request, workspace_id, policy_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave")
        policy = get_object_or_404(LeavePolicy, id=policy_id, workspace=workspace)
        return workspace, policy

    def patch(self, request, workspace_id, policy_id):
        workspace, policy = self._get_policy(request, workspace_id, policy_id)
        serializer = LeavePolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, policy_id):
        workspace, policy = self._get_policy(request, workspace_id, policy_id)
        policy.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Holidays ─────────────────────────────────────────────────────────────────────

class HolidayListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        holidays = Holiday.objects.filter(workspace=workspace)
        return Response(HolidaySerializer(holidays, many=True).data)

    def post(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave")
        serializer = HolidaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(workspace=workspace, created_by=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class HolidayDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def _get_holiday(self, request, workspace_id, holiday_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave")
        holiday = get_object_or_404(Holiday, id=holiday_id, workspace=workspace)
        return workspace, holiday

    def patch(self, request, workspace_id, holiday_id):
        workspace, holiday = self._get_holiday(request, workspace_id, holiday_id)
        serializer = HolidaySerializer(holiday, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, holiday_id):
        workspace, holiday = self._get_holiday(request, workspace_id, holiday_id)
        holiday.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Leave Requests ─────────────────────────────────────────────────────────────

class LeaveRequestListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        qs = LeaveRequest.objects.select_related(
            "employee__user", "policy", "approver"
        ).filter(employee__workspace=workspace)

        # Leave managers see every request; everyone else sees only their own.
        if not access.has_perm(request.user, workspace, "hr.manage_leave"):
            qs = qs.filter(employee=member)

        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)

        # Backstop against unbounded history: default to the last 24 months
        # (by creation) unless the caller explicitly opts out with ?all=true.
        if request.query_params.get("all") not in ("1", "true", "True"):
            cutoff = timezone.localdate() - timedelta(days=730)
            qs = qs.filter(created_at__date__gte=cutoff)

        return Response(LeaveRequestSerializer(qs, many=True).data)

    def post(self, request, workspace_id):
        workspace = _self_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        serializer = LeaveRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        policy = get_object_or_404(
            LeavePolicy,
            id=serializer.validated_data["policy_id"],
            workspace=workspace,
        )

        start = serializer.validated_data["start_date"]
        end = serializer.validated_data["end_date"]
        if end < start:
            raise ValidationError({"end_date": "End date must be on or after start date."})

        start_day_part = serializer.validated_data.get("start_day_part", LeaveRequest.DayPart.FULL)
        end_day_part = serializer.validated_data.get("end_day_part", LeaveRequest.DayPart.FULL)
        days_requested = _leave_days(workspace, start, end, start_day_part, end_day_part)
        if days_requested <= 0:
            raise ValidationError(
                {"non_field_errors": "This date range has no working days to request (weekends/holidays only)."}
            )

        # Balance is tracked per the year the leave is taken (start_date.year),
        # matching the review path — otherwise pending/used land on different rows.
        # Lock the balance row so concurrent requests can't both pass the check and
        # over-allocate (read-modify-write race).
        current_year = start.year
        with transaction.atomic():
            balance, _ = LeaveBalance.objects.select_for_update().get_or_create(
                employee=member, policy=policy, year=current_year,
                defaults={"total_days": policy.days_per_year},
            )
            available = float(balance.total_days - balance.used_days - balance.pending_days)
            if days_requested > available:
                raise ValidationError(
                    {"non_field_errors": f"Insufficient balance. Available: {available} days, requested: {days_requested} days."}
                )

            leave_request = serializer.save(employee=member, policy=policy, days_requested=days_requested)
            balance.pending_days = float(balance.pending_days) + float(days_requested)
            balance.save(update_fields=["pending_days"])

        # Notify workspace admins (owner + settings.manage holders)
        for admin_member in access.workspace_admins(workspace):
            if admin_member.user != request.user:
                notify(
                    recipient=admin_member.user,
                    actor=request.user,
                    verb="leave.requested",
                    workspace=workspace,
                    task=None,
                )

        requester = request.user.full_name or request.user.email
        broadcast(
            workspace.id,
            "leave.requested",
            LeaveRequestSerializer(leave_request).data,
            actor_id=request.user.id,
            chat={
                "title": f"{requester} requested {policy.name}",
                "subtitle": workspace.name,
                "facts": {
                    "From": str(leave_request.start_date),
                    "To": str(leave_request.end_date),
                    "Days": days_requested,
                },
            },
        )

        return Response(LeaveRequestSerializer(leave_request).data, status=status.HTTP_201_CREATED)


class LeaveRequestReviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def post(self, request, workspace_id, request_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave")

        leave_request = get_object_or_404(
            LeaveRequest.objects.select_related("employee__user", "policy"),
            id=request_id,
            employee__workspace=workspace,
        )

        if leave_request.status != LeaveRequest.Status.PENDING:
            raise ValidationError({"non_field_errors": "Only pending requests can be reviewed."})

        serializer = LeaveRequestReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_status = serializer.validated_data["status"]
        # Reuse the day count locked in at creation — recomputing here would let a
        # holiday added after submission silently change the balance math between
        # submit and approve.
        days = leave_request.days_requested
        current_year = leave_request.start_date.year

        # Lock the balance row and the status transition together so a concurrent
        # review can't double-apply the used/pending adjustment.
        with transaction.atomic():
            leave_request.status = new_status
            leave_request.approver = request.user
            leave_request.reviewer_comment = serializer.validated_data.get("comment", "")
            leave_request.reviewed_at = timezone.now()
            leave_request.save(update_fields=["status", "approver", "reviewer_comment", "reviewed_at"])

            try:
                balance = LeaveBalance.objects.select_for_update().get(
                    employee=leave_request.employee, policy=leave_request.policy, year=current_year
                )
                balance.pending_days = max(0, float(balance.pending_days) - float(days))
                if new_status == "approved":
                    balance.used_days = float(balance.used_days) + float(days)
                balance.save(update_fields=["pending_days", "used_days"])
            except LeaveBalance.DoesNotExist:
                pass

        # Notify the employee
        verb = "leave.approved" if new_status == "approved" else "leave.rejected"
        notify(
            recipient=leave_request.employee.user,
            actor=request.user,
            verb=verb,
            workspace=workspace,
            task=None,
        )

        employee_name = leave_request.employee.user.full_name or leave_request.employee.user.email
        broadcast(
            workspace.id,
            verb,
            LeaveRequestSerializer(leave_request).data,
            actor_id=request.user.id,
            chat={
                "title": f"{employee_name}'s {leave_request.policy.name}",
                "subtitle": workspace.name,
                "facts": {
                    "From": str(leave_request.start_date),
                    "To": str(leave_request.end_date),
                    "Days": days,
                },
            },
        )

        return Response(LeaveRequestSerializer(leave_request).data)


# ── Leave Balances ─────────────────────────────────────────────────────────────

class LeaveBalanceListView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        current_year = timezone.localdate().year
        qs = LeaveBalance.objects.select_related(
            "employee__user", "policy"
        ).filter(policy__workspace=workspace, year=current_year)

        # Leave managers see everyone's balances; everyone else sees only their own.
        if not access.has_perm(request.user, workspace, "hr.manage_leave"):
            qs = qs.filter(employee=member)

        return Response(LeaveBalanceSerializer(qs, many=True).data)


# ── Who's Off ─────────────────────────────────────────────────────────────────

class WhosOffView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)

        today = timezone.localdate()
        window_end = today + timedelta(days=7)

        requests = (
            LeaveRequest.objects.select_related("employee__user", "policy")
            .filter(
                employee__workspace=workspace,
                status=LeaveRequest.Status.APPROVED,
                start_date__lte=window_end,
                end_date__gte=today,
            )
            .order_by("start_date")
        )

        data = []
        for req in requests:
            data.append({
                "id": str(req.id),
                "employee": MiniMemberSerializer(req.employee).data,
                "leave_type": req.policy.leave_type,
                "policy_name": req.policy.name,
                "start_date": str(req.start_date),
                "end_date": str(req.end_date),
                "is_today": req.start_date <= today <= req.end_date,
            })
        return Response(data)


# ── Attendance Policy ──────────────────────────────────────────────────────────

def _get_attendance_policy(workspace):
    policy, _ = AttendancePolicy.objects.get_or_create(workspace=workspace)
    return policy


class AttendancePolicyView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        policy = _get_attendance_policy(workspace)
        return Response(AttendancePolicySerializer(policy).data)

    def patch(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_attendance")
        policy = _get_attendance_policy(workspace)
        serializer = AttendancePolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ── Clock In / Out ─────────────────────────────────────────────────────────────

class ClockInView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def post(self, request, workspace_id):
        workspace = _self_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        today = timezone.localdate()
        now_time = timezone.localtime().time().replace(second=0, microsecond=0)
        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        ip = _client_ip(request)
        outside_geofence = _check_geofence(workspace, member, latitude, longitude)

        record, created = Attendance.objects.get_or_create(
            employee=member,
            date=today,
            defaults={
                "clock_in": now_time,
                "source": Attendance.Source.MANUAL,
                "clock_in_latitude": latitude,
                "clock_in_longitude": longitude,
                "clock_in_ip": ip,
                "clock_in_outside_geofence": outside_geofence,
            },
        )

        if not created and record.clock_in:
            raise ValidationError({"non_field_errors": "Already clocked in today."})

        if not created:
            record.clock_in = now_time
            record.source = Attendance.Source.MANUAL
            record.clock_in_latitude = latitude
            record.clock_in_longitude = longitude
            record.clock_in_ip = ip
            record.clock_in_outside_geofence = outside_geofence
            record.save(update_fields=[
                "clock_in", "source", "clock_in_latitude", "clock_in_longitude",
                "clock_in_ip", "clock_in_outside_geofence",
            ])

        if outside_geofence:
            _notify_geofence_breach(workspace, member)

        policy = _get_attendance_policy(workspace)
        return Response(AttendanceSerializer(record, context={"policy": policy}).data)


class ClockOutView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def post(self, request, workspace_id):
        workspace = _self_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        today = timezone.localdate()
        now_time = timezone.localtime().time().replace(second=0, microsecond=0)

        try:
            record = Attendance.objects.get(employee=member, date=today)
        except Attendance.DoesNotExist:
            raise ValidationError({"non_field_errors": "Not clocked in today."})

        if not record.clock_in:
            raise ValidationError({"non_field_errors": "Not clocked in today."})
        if record.clock_out:
            raise ValidationError({"non_field_errors": "Already clocked out today."})

        latitude = request.data.get("latitude")
        longitude = request.data.get("longitude")
        outside_geofence = _check_geofence(workspace, member, latitude, longitude)

        record.clock_out = now_time
        record.clock_out_latitude = latitude
        record.clock_out_longitude = longitude
        record.clock_out_ip = _client_ip(request)
        record.clock_out_outside_geofence = outside_geofence
        record.save(update_fields=[
            "clock_out", "clock_out_latitude", "clock_out_longitude",
            "clock_out_ip", "clock_out_outside_geofence",
        ])

        if outside_geofence:
            _notify_geofence_breach(workspace, member)

        policy = _get_attendance_policy(workspace)
        return Response(AttendanceSerializer(record, context={"policy": policy}).data)


# ── Attendance List (admin) ────────────────────────────────────────────────────

class AttendanceListView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_attendance", scope="read")

        date_from, date_to = _parse_date_window(request)
        qs = Attendance.objects.select_related("employee__user").filter(
            employee__workspace=workspace,
            date__range=[date_from, date_to],
        )

        employee_filter = request.query_params.get("employee")
        if employee_filter:
            qs = qs.filter(employee_id=employee_filter)

        policy = _get_attendance_policy(workspace)
        return Response(AttendanceSerializer(qs, many=True, context={"policy": policy}).data)


# ── My Attendance ──────────────────────────────────────────────────────────────

class MyAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _view_ws(request, workspace_id)
        member = _get_member(workspace, request.user)

        date_from, date_to = _parse_date_window(request)
        qs = Attendance.objects.filter(employee=member, date__range=[date_from, date_to])

        policy = _get_attendance_policy(workspace)
        return Response(AttendanceSerializer(qs, many=True, context={"policy": policy}).data)


# ── Attendance Summary (admin) ─────────────────────────────────────────────────

class AttendanceSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_attendance", scope="read")

        today = timezone.localdate()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        date_from = request.query_params.get("date_from", str(week_start))
        date_to = request.query_params.get("date_to", str(week_end))

        policy = _get_attendance_policy(workspace)
        grace = timedelta(minutes=policy.grace_period_minutes)
        work_start = policy.work_start_time
        daily_expected_hours = (
            datetime.combine(date.today(), policy.work_end_time)
            - datetime.combine(date.today(), policy.work_start_time)
        ).total_seconds() / 3600

        records = Attendance.objects.select_related("employee__user").filter(
            employee__workspace=workspace,
            date__range=[date_from, date_to],
        )

        summary = {}
        for rec in records:
            emp_id = str(rec.employee_id)
            if emp_id not in summary:
                summary[emp_id] = {
                    "employee": MiniMemberSerializer(rec.employee).data,
                    "total_hours": 0.0,
                    "overtime_hours": 0.0,
                    "late_count": 0,
                    "days_present": 0,
                    "geofence_flags": 0,
                }
            entry = summary[emp_id]
            if rec.clock_in_outside_geofence or rec.clock_out_outside_geofence:
                entry["geofence_flags"] += 1
            if rec.clock_in:
                entry["days_present"] += 1
                if rec.clock_out:
                    cin = datetime.combine(rec.date, rec.clock_in)
                    cout = datetime.combine(rec.date, rec.clock_out)
                    if cout > cin:
                        day_hours = (cout - cin).total_seconds() / 3600
                        entry["total_hours"] += day_hours
                        entry["overtime_hours"] += max(0.0, day_hours - daily_expected_hours)
                actual_dt = datetime.combine(rec.date, rec.clock_in)
                expected_dt = datetime.combine(rec.date, work_start)
                if actual_dt > expected_dt + grace:
                    entry["late_count"] += 1

        result = list(summary.values())
        for item in result:
            item["total_hours"] = round(item["total_hours"], 2)
            item["overtime_hours"] = round(item["overtime_hours"], 2)
            item["expected_hours"] = policy.weekly_hours

        return Response(result)


# ── HR Dashboard ───────────────────────────────────────────────────────────────

class HRDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_leave", scope="read")

        from organization.models import OrgProfile
        today = timezone.localdate()
        this_month_start = today.replace(day=1)
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)

        total_employees = WorkspaceMember.objects.filter(workspace=workspace, is_active=True).count()

        joiners_this_month = OrgProfile.objects.filter(
            member__workspace=workspace,
            start_date__gte=this_month_start,
            start_date__lte=today,
        ).count()

        emp_type_rows = (
            OrgProfile.objects.filter(member__workspace=workspace)
            .values("employment_type")
            .annotate(count=Count("id"))
        )
        employment_split = {row["employment_type"]: row["count"] for row in emp_type_rows}

        approved_requests = LeaveRequest.objects.filter(
            employee__workspace=workspace,
            status="approved",
            start_date__lte=today,
            end_date__gte=this_month_start,
        ).select_related("policy")

        total_days_taken = 0
        leave_by_type = {}
        for req in approved_requests:
            days = (min(req.end_date, today) - max(req.start_date, this_month_start)).days + 1
            total_days_taken += days
            leave_by_type[req.policy.leave_type] = leave_by_type.get(req.policy.leave_type, 0) + days

        att_records = list(Attendance.objects.filter(
            employee__workspace=workspace,
            date__range=[week_start, week_end],
        ))
        att_policy = _get_attendance_policy(workspace)
        grace = timedelta(minutes=att_policy.grace_period_minutes)
        total_att = len(att_records)
        late_count = 0
        absent_count = 0
        for rec in att_records:
            if not rec.clock_in:
                absent_count += 1
            else:
                actual = datetime.combine(rec.date, rec.clock_in)
                expected = datetime.combine(rec.date, att_policy.work_start_time)
                if actual > expected + grace:
                    late_count += 1
        on_time_count = total_att - late_count - absent_count
        on_time_pct = round((on_time_count / total_att * 100) if total_att else 0, 1)

        horizon = today + timedelta(days=30)
        profiles = OrgProfile.objects.filter(
            member__workspace=workspace,
        ).select_related("member__user")

        upcoming = []
        for profile in profiles:
            name = profile.member.user.full_name
            if profile.start_date:
                try:
                    anniversary = profile.start_date.replace(year=today.year)
                except ValueError:
                    anniversary = None
                if anniversary and today <= anniversary <= horizon:
                    years = today.year - profile.start_date.year
                    upcoming.append({"type": "anniversary", "name": name, "date": str(anniversary), "years": years})

        expiring_docs = EmployeeDocument.objects.filter(
            employee__workspace=workspace,
            expiry_date__gte=today,
            expiry_date__lte=horizon,
            doc_type="contract",
        ).select_related("employee__user")
        for doc in expiring_docs:
            upcoming.append({
                "type": "contract_expiry",
                "name": doc.employee.user.full_name,
                "date": str(doc.expiry_date),
            })

        upcoming.sort(key=lambda x: x["date"])

        return Response({
            "headcount": {
                "total": total_employees,
                "joiners_this_month": joiners_this_month,
                "employment_split": employment_split,
            },
            "leave_overview": {
                "total_days_taken": total_days_taken,
                "by_type": leave_by_type,
            },
            "attendance_overview": {
                "on_time_pct": on_time_pct,
                "late_count": late_count,
                "absent_count": absent_count,
                "period": {"from": str(week_start), "to": str(week_end)},
            },
            "upcoming_events": upcoming,
        })


# ── Employee Documents ─────────────────────────────────────────────────────────

class EmployeeDocumentListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, member_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_documents", scope="read")
        employee = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        docs = EmployeeDocument.objects.filter(employee=employee).select_related("uploaded_by")
        return Response(EmployeeDocumentSerializer(docs, many=True).data)

    def post(self, request, workspace_id, member_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_documents")
        employee = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)

        file_obj = request.FILES.get("file")
        if not file_obj:
            raise ValidationError({"file": "No file provided."})
        if file_obj.size > MAX_DOC_SIZE_BYTES:
            raise ValidationError(
                {"file": f"File too large (max {MAX_DOC_SIZE_BYTES // (1024 * 1024)} MB)."}
            )
        if file_obj.content_type not in ALLOWED_DOC_CONTENT_TYPES:
            raise ValidationError(
                {"file": f"Unsupported file type '{file_obj.content_type}'. Allowed: PDF, images, Word documents."}
            )

        doc = EmployeeDocument.objects.create(
            employee=employee,
            doc_type=request.data.get("doc_type", EmployeeDocument.DocType.OTHER),
            file=file_obj,
            original_name=file_obj.name,
            expiry_date=request.data.get("expiry_date") or None,
            uploaded_by=request.user,
        )
        return Response(EmployeeDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class EmployeeDocumentDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def delete(self, request, workspace_id, member_id, doc_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_documents")
        doc = get_object_or_404(
            EmployeeDocument, id=doc_id, employee__workspace=workspace, employee_id=member_id
        )
        doc.file.delete(save=False)
        doc.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Employee Notes ─────────────────────────────────────────────────────────────

class EmployeeNoteListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id, member_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_notes", scope="read")
        employee = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        notes = EmployeeNote.objects.filter(employee=employee).select_related("author")
        return Response(EmployeeNoteSerializer(notes, many=True).data)

    def post(self, request, workspace_id, member_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_notes")
        employee = get_object_or_404(WorkspaceMember, id=member_id, workspace=workspace)
        ser = EmployeeNoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        note = ser.save(employee=employee, author=request.user)
        return Response(EmployeeNoteSerializer(note).data, status=status.HTTP_201_CREATED)


class EmployeeNoteDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def patch(self, request, workspace_id, member_id, note_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_notes")
        note = get_object_or_404(
            EmployeeNote, id=note_id, employee__workspace=workspace, employee_id=member_id
        )
        ser = EmployeeNoteSerializer(note, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)

    def delete(self, request, workspace_id, member_id, note_id):
        workspace = _manage_ws(request, workspace_id, "hr.manage_notes")
        note = get_object_or_404(
            EmployeeNote, id=note_id, employee__workspace=workspace, employee_id=member_id
        )
        note.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
