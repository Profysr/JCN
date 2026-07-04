from django.db import models
from django.conf import settings

from core.fields import UUIDv7Field
from workspaces.models import Workspace, WorkspaceMember





class LeavePolicy(models.Model):
    class LeaveType(models.TextChoices):
        ANNUAL = "annual", "Annual"
        SICK = "sick", "Sick"
        UNPAID = "unpaid", "Unpaid"
        PATERNITY = "paternity", "Paternity"
        MATERNITY = "maternity", "Maternity"
        COMPASSIONATE = "compassionate", "Compassionate"

    class AccrualType(models.TextChoices):
        UPFRONT = "upfront", "Upfront"
        MONTHLY = "monthly", "Monthly"

    PREFIX = "lpol"
    id = UUIDv7Field()
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE, related_name="leave_policies")
    name = models.CharField(max_length=100)
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    days_per_year = models.PositiveSmallIntegerField(default=0)
    carry_over_days = models.PositiveSmallIntegerField(default=0)
    accrual_type = models.CharField(max_length=10, choices=AccrualType.choices, default=AccrualType.UPFRONT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["leave_type", "name"]

    def __str__(self):
        return f"{self.name} ({self.workspace.name})"


class LeaveBalance(models.Model):
    PREFIX = "lbal"
    id = UUIDv7Field()
    employee = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="leave_balances")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.CASCADE, related_name="balances")
    year = models.PositiveSmallIntegerField()
    total_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    used_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)
    pending_days = models.DecimalField(max_digits=5, decimal_places=1, default=0)

    class Meta:
        unique_together = ["employee", "policy", "year"]
        indexes = [
            models.Index(fields=["employee", "year"], name="lb_employee_year_idx"),
        ]

    def __str__(self):
        return f"{self.employee} — {self.policy.name} {self.year}"


class LeaveRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    PREFIX = "lreq"
    id = UUIDv7Field()
    employee = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="leave_requests")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.CASCADE, related_name="requests")
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_leave_requests",
    )
    reviewer_comment = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["employee", "status"], name="lr_employee_status_idx"),
            models.Index(fields=["policy", "start_date", "end_date"], name="leave_request_policy_dates_idx"),
        ]

    def __str__(self):
        return f"{self.employee} — {self.policy.leave_type} {self.start_date}→{self.end_date}"


class EmployeeDocument(models.Model):
    class DocType(models.TextChoices):
        CONTRACT = "contract", "Contract"
        ID = "id", "ID"
        CERTIFICATE = "certificate", "Certificate"
        OTHER = "other", "Other"

    PREFIX = "edoc"
    id = UUIDv7Field()
    employee = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="documents")
    doc_type = models.CharField(max_length=20, choices=DocType.choices, default=DocType.OTHER)
    file = models.FileField(upload_to="employee_docs/")
    original_name = models.CharField(max_length=255)
    expiry_date = models.DateField(null=True, blank=True)
    expiry_notified_at = models.DateTimeField(null=True, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_employee_docs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["employee"], name="edoc_employee_idx"),
        ]

    def __str__(self):
        return f"{self.employee} — {self.doc_type} ({self.original_name})"


class EmployeeNote(models.Model):
    PREFIX = "enot"
    id = UUIDv7Field()
    employee = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="authored_employee_notes",
    )
    content = models.TextField()
    is_private = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["employee"], name="enot_employee_idx"),
        ]

    def __str__(self):
        return f"Note by {self.author} on {self.employee}"


class AttendancePolicy(models.Model):
    PREFIX = "apol"
    id = UUIDv7Field()
    workspace = models.OneToOneField(Workspace, on_delete=models.CASCADE, related_name="attendance_policy")
    work_start_time = models.TimeField(default="09:00")
    work_end_time = models.TimeField(default="17:00")
    grace_period_minutes = models.PositiveSmallIntegerField(default=15)
    weekly_hours = models.PositiveSmallIntegerField(default=40)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Attendance policies"

    def __str__(self):
        return f"Attendance policy — {self.workspace.name}"


class Attendance(models.Model):
    class Source(models.TextChoices):
        MANUAL = "manual", "Manual"
        API = "api", "API"

    PREFIX = "att"
    id = UUIDv7Field()
    employee = models.ForeignKey(WorkspaceMember, on_delete=models.CASCADE, related_name="attendance_records")
    date = models.DateField()
    clock_in = models.TimeField(null=True, blank=True)
    clock_out = models.TimeField(null=True, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.MANUAL)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # unique_together already creates a (employee, date) index, which also serves
        # employee-only and employee+date-range lookups — no separate index needed.
        unique_together = ["employee", "date"]
        ordering = ["-date"]

    def __str__(self):
        return f"{self.employee} — {self.date}"
