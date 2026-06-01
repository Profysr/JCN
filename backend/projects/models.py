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
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_projects")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.workspace.name} / {self.name}"


class TaskStatus(models.Model):
    """Configurable Kanban columns — each project defines its own."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="statuses")
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#6366f1")
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ["project", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class Task(models.Model):
    class Priority(models.TextChoices):
        NO_PRIORITY = "no_priority", "No Priority"
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

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
    labels   = models.ManyToManyField("Label", blank=True, related_name="tasks")
    sprint   = models.ForeignKey("Sprint", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks")
    due_date = models.DateField(null=True, blank=True)
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


class SavedView(models.Model):
    """Named filter preset per project per user (v0.8.0)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="saved_views")
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
