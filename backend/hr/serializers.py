from datetime import datetime, timedelta
from decimal import Decimal

from django.utils.timezone import now

from rest_framework import serializers

from accounts.serializers import MiniUserSerializer
from workspaces.models import WorkspaceMember
from .models import Attendance, AttendancePolicy, EmployeeDocument, EmployeeNote, Holiday, LeaveBalance, LeavePolicy, LeaveRequest

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


class MiniMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user = MiniUserSerializer(read_only=True)
    role = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role"]

    def get_role(self, obj):
        try:
            return obj.role_assignment.role.name
        except Exception:
            return None


class LeavePolicySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = LeavePolicy
        fields = [
            "id", "name", "leave_type", "days_per_year",
            "carry_over_days", "carry_over_enabled", "accrual_type", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class LeaveBalanceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    employee = MiniMemberSerializer(read_only=True)
    policy = LeavePolicySerializer(read_only=True)
    remaining_days = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = [
            "id", "employee", "policy", "year",
            "total_days", "used_days", "pending_days", "carried_over_days", "remaining_days",
        ]
        read_only_fields = ["id"]

    def get_remaining_days(self, obj):
        return float(obj.total_days - obj.used_days - obj.pending_days)


class LeaveRequestSerializer(serializers.ModelSerializer):
    """Read-only representation used for list/detail/review responses.
    Creation goes through LeaveRequestCreateSerializer instead."""

    employee = MiniMemberSerializer(read_only=True)
    policy = LeavePolicySerializer(read_only=True)
    approver = MiniUserSerializer(read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id", "employee", "policy",
            "start_date", "end_date", "start_day_part", "end_day_part", "days_requested",
            "reason", "status", "approver", "reviewer_comment", "reviewed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = fields


class LeaveRequestCreateSerializer(serializers.ModelSerializer):
    """Validates a new leave request: policy must belong to the caller's
    workspace, the date range must be sane, and it must cover at least one
    working day. Resolves `policy` and computes `days_requested` so the view
    only has to worry about the balance check/lock and persistence.
    """

    policy_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = LeaveRequest
        fields = ["policy_id", "start_date", "end_date", "start_day_part", "end_day_part", "reason"]

    def validate(self, attrs):
        workspace = self.context["workspace"]
        try:
            policy = LeavePolicy.objects.get(id=attrs.pop("policy_id"), workspace=workspace)
        except LeavePolicy.DoesNotExist:
            raise serializers.ValidationError({"policy_id": "Policy not found in this workspace."})

        start, end = attrs["start_date"], attrs["end_date"]
        if end < start:
            raise serializers.ValidationError({"end_date": "End date must be on or after start date."})

        start_part = attrs.get("start_day_part", LeaveRequest.DayPart.FULL)
        end_part = attrs.get("end_day_part", LeaveRequest.DayPart.FULL)
        days_requested = _leave_days(workspace, start, end, start_part, end_part)
        if days_requested <= 0:
            raise serializers.ValidationError(
                {"non_field_errors": "This date range has no working days to request (weekends/holidays only)."}
            )

        attrs["policy"] = policy
        attrs["days_requested"] = days_requested
        return attrs


class LeaveRequestReviewSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=["approved", "rejected"])
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class HolidaySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    created_by = MiniUserSerializer(read_only=True)

    class Meta:
        model = Holiday
        fields = ["id", "name", "date", "is_recurring", "location", "created_by", "created_at"]
        read_only_fields = ["id", "created_by", "created_at"]


class AttendancePolicySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = AttendancePolicy
        fields = [
            "id", "work_start_time", "work_end_time",
            "grace_period_minutes", "weekly_hours",
            "geofence_enabled", "geofence_radius_meters", "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]


class ClockCoordinatesSerializer(serializers.Serializer):
    """Optional geolocation captured from the browser at clock-in/out. Kept
    separate from AttendanceSerializer since it's the only part of the
    clock-in/out payload the client actually supplies."""

    latitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True, default=None)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True, default=None)


class AttendanceSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    employee = MiniMemberSerializer(read_only=True)
    status = serializers.SerializerMethodField()
    total_hours = serializers.SerializerMethodField()
    overtime_hours = serializers.SerializerMethodField()

    class Meta:
        model = Attendance
        fields = [
            "id", "employee", "date", "clock_in", "clock_out",
            "clock_in_latitude", "clock_in_longitude", "clock_in_ip", "clock_in_outside_geofence",
            "clock_out_latitude", "clock_out_longitude", "clock_out_ip", "clock_out_outside_geofence",
            "source", "notes", "status", "total_hours", "overtime_hours", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "employee", "status", "total_hours", "overtime_hours",
            "clock_in_latitude", "clock_in_longitude", "clock_in_ip", "clock_in_outside_geofence",
            "clock_out_latitude", "clock_out_longitude", "clock_out_ip", "clock_out_outside_geofence",
            "created_at", "updated_at",
        ]

    def get_status(self, obj):
        if not obj.clock_in:
            return "absent"
        policy = self.context.get("policy")
        if policy:
            grace = timedelta(minutes=policy.grace_period_minutes)
            expected_dt = datetime.combine(obj.date, policy.work_start_time)
            actual_dt = datetime.combine(obj.date, obj.clock_in)
            if actual_dt > expected_dt + grace:
                return "late"
        return "on_time"

    def get_total_hours(self, obj):
        if obj.clock_in and obj.clock_out:
            cin = datetime.combine(obj.date, obj.clock_in)
            cout = datetime.combine(obj.date, obj.clock_out)
            if cout > cin:
                return round((cout - cin).total_seconds() / 3600, 2)
        return None

    def get_overtime_hours(self, obj):
        total_hours = self.get_total_hours(obj)
        policy = self.context.get("policy")
        if total_hours is None or not policy:
            return None
        expected = datetime.combine(obj.date, policy.work_end_time) - datetime.combine(obj.date, policy.work_start_time)
        return round(max(0.0, total_hours - expected.total_seconds() / 3600), 2)


class EmployeeDocumentSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    uploaded_by = MiniUserSerializer(read_only=True)
    days_until_expiry = serializers.SerializerMethodField()

    class Meta:
        model = EmployeeDocument
        fields = [
            "id", "doc_type", "file", "original_name",
            "expiry_date", "uploaded_by", "days_until_expiry", "created_at",
        ]
        read_only_fields = ["id", "uploaded_by", "original_name", "days_until_expiry", "created_at"]

    def get_days_until_expiry(self, obj):
        if not obj.expiry_date:
            return None
        return (obj.expiry_date - now().date()).days

    def validate_file(self, value):
        if value.size > MAX_DOC_SIZE_BYTES:
            raise serializers.ValidationError(
                f"File too large (max {MAX_DOC_SIZE_BYTES // (1024 * 1024)} MB)."
            )
        if value.content_type not in ALLOWED_DOC_CONTENT_TYPES:
            raise serializers.ValidationError(
                f"Unsupported file type '{value.content_type}'. Allowed: PDF, images, Word documents."
            )
        return value

    def create(self, validated_data):
        validated_data["original_name"] = validated_data["file"].name
        return super().create(validated_data)


class EmployeeNoteSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    author = MiniUserSerializer(read_only=True)

    class Meta:
        model = EmployeeNote
        fields = ["id", "content", "is_private", "author", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "created_at", "updated_at"]


class WhosOffSerializer(serializers.Serializer):
    """Flattens an approved LeaveRequest into the who's-off widget shape."""

    id = serializers.UUIDField()
    employee = MiniMemberSerializer()
    leave_type = serializers.CharField(source="policy.leave_type")
    policy_name = serializers.CharField(source="policy.name")
    start_date = serializers.DateField()
    end_date = serializers.DateField()
    is_today = serializers.SerializerMethodField()

    def get_is_today(self, obj):
        today = self.context["today"]
        return obj.start_date <= today <= obj.end_date
