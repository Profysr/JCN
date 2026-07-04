from datetime import datetime, timedelta

from rest_framework import serializers

from accounts.serializers import MiniUserSerializer
from workspaces.models import WorkspaceMember
from .models import Attendance, AttendancePolicy, EmployeeDocument, EmployeeNote, Holiday, LeaveBalance, LeavePolicy, LeaveRequest


class MiniMemberSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    user = MiniUserSerializer(read_only=True)

    class Meta:
        model = WorkspaceMember
        fields = ["id", "user", "role"]


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
    id = serializers.UUIDField(read_only=True)
    employee = MiniMemberSerializer(read_only=True)
    policy = LeavePolicySerializer(read_only=True)
    policy_id = serializers.UUIDField(write_only=True)
    approver = MiniUserSerializer(read_only=True)

    class Meta:
        model = LeaveRequest
        fields = [
            "id", "employee", "policy", "policy_id",
            "start_date", "end_date", "start_day_part", "end_day_part", "days_requested",
            "reason", "status", "approver", "reviewer_comment", "reviewed_at",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "employee", "days_requested", "status", "approver",
            "reviewer_comment", "reviewed_at", "created_at", "updated_at",
        ]


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
        from django.utils.timezone import now
        delta = (obj.expiry_date - now().date()).days
        return delta


class EmployeeNoteSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    author = MiniUserSerializer(read_only=True)

    class Meta:
        model = EmployeeNote
        fields = ["id", "content", "is_private", "author", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "created_at", "updated_at"]
