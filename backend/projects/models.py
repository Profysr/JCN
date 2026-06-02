import uuid
from django.db import models
from django.conf import settings

class Project(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    is_private = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_projects")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.workspace.name} / {self.name}"


class TaskStatus(models.Model):
    """Configurable Kanban columns — each project defines its own."""
    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="statuses")
    name    = models.CharField(max_length=100)
    color   = models.CharField(max_length=7, default="#6366f1")
    order   = models.PositiveIntegerField(default=0)
    is_done = models.BooleanField(default=False)  # counts toward completion %

    class Meta:
        ordering = ["order"]
        unique_together = ["project", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class Task(models.Model):
    class Priority(models.TextChoices):
        NO_PRIORITY = "no_priority", "No Priority"
        LOW         = "low",         "Low"
        MEDIUM      = "medium",      "Medium"
        HIGH        = "high",        "High"
        URGENT      = "urgent",      "Urgent"

    class TaskType(models.TextChoices):
        TASK        = "task",        "Task"
        BUG         = "bug",         "Bug"
        FEATURE     = "feature",     "Feature"
        STORY       = "story",       "Story"
        IMPROVEMENT = "improvement", "Improvement"
        QUESTION    = "question",    "Question"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    status = models.ForeignKey(TaskStatus, on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    priority = models.CharField(max_length=20, choices=Priority.choices, default=Priority.NO_PRIORITY)
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="assigned_tasks"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="created_tasks"
    )
    task_type = models.CharField(max_length=20, choices=TaskType.choices, default=TaskType.TASK)
    labels    = models.ManyToManyField("Label", blank=True, related_name="tasks")
    sprint    = models.ForeignKey("Sprint", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    due_date  = models.DateField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.title


class SubTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="subtasks")
    title = models.CharField(max_length=500)
    is_done = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return self.title


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="task_comments")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.task.title}"


class Label(models.Model):
    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="labels")
    name    = models.CharField(max_length=50)
    color   = models.CharField(max_length=7, default="#6366f1")

    class Meta:
        ordering = ["name"]
        unique_together = ["project", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class ProjectField(models.Model):
    """Custom field definition scoped to a project (v0.8.0)."""
    class FieldType(models.TextChoices):
        TEXT   = "text",   "Text"
        NUMBER = "number", "Number"
        SELECT = "select", "Select"
        URL    = "url",    "URL"
        DATE   = "date",   "Date"

    id      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="fields")
    name    = models.CharField(max_length=100)
    type    = models.CharField(max_length=20, choices=FieldType.choices, default=FieldType.TEXT)
    options = models.JSONField(default=list)   # for select: ["Option A", "Option B"]
    order   = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ["project", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.name} ({self.type})"


class TaskFieldValue(models.Model):
    """Per-task value for a custom field (v0.8.0)."""
    id    = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task  = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="field_values")
    field = models.ForeignKey(ProjectField, on_delete=models.CASCADE, related_name="values")
    value = models.TextField(blank=True)

    class Meta:
        unique_together = ["task", "field"]

    def __str__(self):
        return f"{self.task.title} / {self.field.name}: {self.value}"


class Board(models.Model):
    """A named view over a project's tasks (v2.2.0). Tasks belong to Project; boards are lenses."""
    class BoardType(models.TextChoices):
        KANBAN   = "kanban",   "Kanban"
        SCRUM    = "scrum",    "Scrum"
        LIST     = "list",     "List"
        TIMELINE = "timeline", "Timeline"
        CALENDAR = "calendar", "Calendar"

    class Visibility(models.TextChoices):
        PUBLIC  = "public",  "Workspace Public"
        PRIVATE = "private", "Private (only you)"
        SECRET  = "secret",  "Secret (invite only)"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="boards")
    name        = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    board_type  = models.CharField(max_length=20, choices=BoardType.choices, default=BoardType.KANBAN)
    is_default  = models.BooleanField(default=False)
    visibility  = models.CharField(max_length=20, choices=Visibility.choices, default=Visibility.PUBLIC)
    config      = models.JSONField(default=dict)   # {wip_limits, swimlane_by, column_order}
    order       = models.PositiveIntegerField(default=0)
    is_archived = models.BooleanField(default=False)
    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_boards")
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "created_at"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class SavedView(models.Model):
    """Named filter preset per project per user (v0.8.0). Optionally scoped to a board (v2.2.0)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="saved_views")
    board      = models.ForeignKey("Board", on_delete=models.CASCADE, null=True, blank=True, related_name="saved_views")
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_views")
    name       = models.CharField(max_length=100)
    filters    = models.JSONField(default=dict)  # {search, priorities, assignees, labels}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["project", "user", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.user.email} / {self.name}"


class Sprint(models.Model):
    """Time-boxed work cycle per project (v0.9.0)."""
    class Status(models.TextChoices):
        PLANNING  = "planning",  "Planning"
        ACTIVE    = "active",    "Active"
        COMPLETED = "completed", "Completed"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="sprints")
    name       = models.CharField(max_length=255)
    goal       = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date   = models.DateField(null=True, blank=True)
    status     = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNING)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class TaskAttachment(models.Model):
    """File attached to a task (v1.2.0)."""
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task          = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    file          = models.FileField(upload_to="task_attachments/%Y/%m/")
    original_name = models.CharField(max_length=255)
    file_size     = models.PositiveIntegerField()          # bytes
    mime_type     = models.CharField(max_length=100, blank=True)
    uploaded_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.original_name} on {self.task.title}"


class TaskDependency(models.Model):
    """Task blocking relationship — blocker must finish before blocked can start (v1.4.0)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    blocker    = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="blocking_deps")
    blocked    = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="blocked_by_deps")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["blocker", "blocked"]

    def __str__(self):
        return f"{self.blocker.title} blocks {self.blocked.title}"


class TaskActivity(models.Model):
    """Immutable audit log — one row per event on a task."""
    class Verb(models.TextChoices):
        CREATED    = "created",        "created the task"
        UPDATED    = "updated",        "updated the task"
        STATUS     = "status_changed", "changed status"
        PRIORITY   = "priority_changed", "changed priority"
        ASSIGNED   = "assigned",       "assigned the task"
        COMMENTED  = "commented",      "added a comment"
        SUBTASK    = "subtask_added",  "added a subtask"

    id        = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task      = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activities")
    actor     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="task_activities")
    verb      = models.CharField(max_length=30, choices=Verb.choices)
    meta      = models.JSONField(default=dict)   # {"from": "Backlog", "to": "In Progress"}
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.actor} {self.verb} on {self.task}"


# ── v2.1.0 — Access Control ───────────────────────────────────────────────────

class ProjectMember(models.Model):
    """Project-level role override — takes precedence over (or further restricts) workspace role."""
    class Role(models.TextChoices):
        ADMIN  = "admin",  "Admin"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"
        GUEST  = "guest",  "Guest"

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="project_members")
    user       = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="project_memberships")
    role       = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    added_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="added_project_members")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["project", "user"]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.user.email} → {self.project.name} ({self.role})"


class GuestToken(models.Model):
    """Time-limited read-only shareable link to a project."""
    EXPIRY_CHOICES = [(7, "7 days"), (14, "14 days"), (30, "30 days")]

    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="guest_tokens")
    token      = models.UUIDField(default=uuid.uuid4, unique=True)
    label      = models.CharField(max_length=100, blank=True)
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_guest_tokens")
    is_active  = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def is_expired(self):
        from django.utils import timezone
        return timezone.now() > self.expires_at

    def __str__(self):
        return f"GuestToken for {self.project.name} (expires {self.expires_at.date()})"


class AuditEvent(models.Model):
    """Immutable log of permission-related changes."""
    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace     = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE, related_name="audit_events")
    actor         = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="audit_events")
    action        = models.CharField(max_length=64)   # e.g. "project_member.added"
    resource_type = models.CharField(max_length=64)   # e.g. "project_member"
    resource_id   = models.CharField(max_length=100)
    before        = models.JSONField(default=dict)
    after         = models.JSONField(default=dict)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.actor} — {self.action} at {self.created_at}"
