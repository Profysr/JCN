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
        EPIC        = "epic",        "Epic"
        IMPROVEMENT = "improvement", "Improvement"
        QUESTION    = "question",    "Question"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    # v2.4.0 — self-referential hierarchy: Epic → Story → Task → child Task
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
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
    due_date   = models.DateField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)         # v2.4.0
    estimate_points = models.PositiveIntegerField(null=True, blank=True)  # v2.4.0 story points
    estimate_hours  = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)  # v2.4.0
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "-created_at"]

    def __str__(self):
        return self.title

    # v2.4.0 — rollup stats aggregated from all direct children
    @property
    def child_count(self):
        return self.children.count()

    @property
    def done_child_count(self):
        return self.children.filter(status__is_done=True).count()

    def clone(self, created_by):
        """Deep-clone this task (children + labels); strips assignee, dates, sprint."""
        new_task = Task.objects.create(
            project=self.project,
            parent=self.parent,
            title=f"{self.title} (Copy)",
            description=self.description,
            status=self.status,
            priority=self.priority,
            task_type=self.task_type,
            estimate_points=self.estimate_points,
            estimate_hours=self.estimate_hours,
            created_by=created_by,
        )
        new_task.labels.set(self.labels.all())
        for child in self.children.all():
            child_clone = child.clone(created_by)
            child_clone.parent = new_task
            child_clone.save(update_fields=["parent"])
        for sub in self.subtasks.all():
            SubTask.objects.create(task=new_task, title=sub.title, order=sub.order)
        return new_task


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
    """Named filter preset per project per user (v0.8.0). Extended in v3.2.0."""
    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project             = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="saved_views")
    board               = models.ForeignKey("Board", on_delete=models.CASCADE, null=True, blank=True, related_name="saved_views")
    user                = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_views")
    name                = models.CharField(max_length=100)
    filters             = models.JSONField(default=dict)
    # v3.2.0 — search alerts
    is_workspace_scoped = models.BooleanField(default=False)
    alert_enabled       = models.BooleanField(default=False)
    created_at          = models.DateTimeField(auto_now_add=True)

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
    """Task relationships — blocks/blocked_by + extended relation types (v2.4.0)."""
    class RelationType(models.TextChoices):
        BLOCKS       = "blocks",       "Blocks"
        BLOCKED_BY   = "blocked_by",   "Blocked by"
        RELATES_TO   = "relates_to",   "Relates to"
        DUPLICATE_OF = "duplicate_of", "Duplicate of"
        CLONED_FROM  = "cloned_from",  "Cloned from"

    id            = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    blocker       = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="blocking_deps")
    blocked       = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="blocked_by_deps")
    relation_type = models.CharField(max_length=20, choices=RelationType.choices, default=RelationType.BLOCKS)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["blocker", "blocked"]

    def __str__(self):
        return f"{self.blocker.title} {self.relation_type} {self.blocked.title}"


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


# ── v2.4.0 — Task Templates ───────────────────────────────────────────────────

class TaskTemplate(models.Model):
    """Reusable task structure — pre-filled fields + default subtasks."""
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="task_templates")
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    task_type   = models.CharField(max_length=20, choices=Task.TaskType.choices, default=Task.TaskType.TASK)
    priority    = models.CharField(max_length=20, choices=Task.Priority.choices, default=Task.Priority.NO_PRIORITY)
    # subtasks stored as JSON list of {title, order}
    default_subtasks = models.JSONField(default=list)
    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_task_templates")
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["project", "name"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────

class WikiPage(models.Model):
    """Project-scoped wiki page with parent hierarchy and version history."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="wiki_pages")
    parent     = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="children")
    title      = models.CharField(max_length=255)
    slug       = models.SlugField(max_length=255)
    content    = models.TextField(blank=True)  # stored as markdown
    is_public  = models.BooleanField(default=False)
    order      = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_wiki_pages")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "title"]
        unique_together = ["project", "slug"]

    def __str__(self):
        return f"{self.project.name} / {self.title}"


class WikiRevision(models.Model):
    """Immutable snapshot of a WikiPage at a point in time."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    page       = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="revisions")
    content    = models.TextField()
    title      = models.CharField(max_length=255)
    author     = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="wiki_revisions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Revision of {self.page.title} at {self.created_at}"


class Document(models.Model):
    """Workspace-scoped standalone document (meeting notes, specs, runbooks)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace  = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE, related_name="documents")
    title      = models.CharField(max_length=255)
    content    = models.TextField(blank=True)  # stored as markdown
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_documents")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.workspace.name} / {self.title}"


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────

class Form(models.Model):
    """Project-scoped intake form that creates tasks from submissions."""
    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project     = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="forms")
    name        = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active   = models.BooleanField(default=True)
    # Public token — embedded in the share URL, no auth required
    token       = models.UUIDField(default=uuid.uuid4, unique=True)
    # JSONField config: {success_message, redirect_url, create_task, default_status_id, default_assignee_id}
    config      = models.JSONField(default=dict)
    created_by  = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="created_forms")
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class FormField(models.Model):
    """A field inside an intake form."""
    class FieldType(models.TextChoices):
        SHORT_TEXT  = "short_text",  "Short Text"
        LONG_TEXT   = "long_text",   "Long Text"
        EMAIL       = "email",       "Email"
        NUMBER      = "number",      "Number"
        DROPDOWN    = "dropdown",    "Dropdown"
        MULTISELECT = "multiselect", "Multi-Select"
        DATE        = "date",        "Date"
        FILE        = "file",        "File Upload"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    form        = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="fields")
    label       = models.CharField(max_length=255)
    field_type  = models.CharField(max_length=20, choices=FieldType.choices, default=FieldType.SHORT_TEXT)
    placeholder = models.CharField(max_length=255, blank=True)
    is_required = models.BooleanField(default=False)
    options     = models.JSONField(default=list)  # for dropdown/multiselect
    order       = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.form.name} / {self.label}"


class FormSubmission(models.Model):
    """A submitted form response, optionally linked to a created task."""
    class Status(models.TextChoices):
        NEW       = "new",       "New"
        IN_REVIEW = "in_review", "In Review"
        CLOSED    = "closed",    "Closed"

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    form            = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="submissions")
    answers         = models.JSONField(default=dict)  # {field_id: value}
    submitter_email = models.EmailField(blank=True)
    task            = models.OneToOneField(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name="from_submission")
    status          = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    submitted_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Submission to {self.form.name} at {self.submitted_at}"


# ── v2.7.0 — Automation Engine ────────────────────────────────────────────────

class AutomationRule(models.Model):
    """No-code automation rule: when trigger + conditions → run actions."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    project    = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="automation_rules")
    name       = models.CharField(max_length=255)
    is_active  = models.BooleanField(default=True)
    fire_count = models.PositiveIntegerField(default=0)
    # Trigger: {type: "task.created" | "task.status_changed" | "task.assigned" | "task.overdue"}
    trigger    = models.JSONField(default=dict)
    # Conditions: [{field, operator, value}]
    conditions = models.JSONField(default=list)
    # Actions: [{type, payload}]
    actions    = models.JSONField(default=list)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="automation_rules")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.project.name} / {self.name}"


class AutomationLog(models.Model):
    """Immutable execution record for each automation rule fire."""
    class ExecStatus(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED  = "failed",  "Failed"

    id          = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rule        = models.ForeignKey(AutomationRule, on_delete=models.CASCADE, related_name="logs")
    task        = models.ForeignKey(Task, on_delete=models.SET_NULL, null=True, blank=True, related_name="automation_logs")
    trigger_payload = models.JSONField(default=dict)
    actions_run     = models.JSONField(default=list)
    exec_status     = models.CharField(max_length=20, choices=ExecStatus.choices, default=ExecStatus.SUCCESS)
    error_message   = models.TextField(blank=True)
    duration_ms     = models.PositiveIntegerField(default=0)
    created_at      = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.rule.name} → {self.exec_status} at {self.created_at}"


# ── v2.8.0 — Time Tracking ────────────────────────────────────────────────────

class TimeEntry(models.Model):
    """One unit of logged time against a task — either timer-based or manual."""
    id               = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task             = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="time_entries")
    user             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_entries")
    description      = models.CharField(max_length=500, blank=True)
    start_at         = models.DateTimeField(null=True, blank=True)  # null = manual entry
    end_at           = models.DateTimeField(null=True, blank=True)  # null = timer still running
    duration_seconds = models.PositiveIntegerField(default=0)       # 0 while running; set on stop
    is_billable      = models.BooleanField(default=False)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_running(self):
        return self.start_at is not None and self.end_at is None

    def stop(self):
        from django.utils import timezone
        self.end_at = timezone.now()
        self.duration_seconds = int((self.end_at - self.start_at).total_seconds())
        self.save(update_fields=["end_at", "duration_seconds"])

    def __str__(self):
        return f"{self.user.email} — {self.task.title} ({self.duration_seconds}s)"


# ── v3.3.0 — Custom Dashboards ────────────────────────────────────────────────
class Dashboard(models.Model):
    """Configurable widget canvas per workspace (v3.3.0)."""
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace  = models.ForeignKey("workspaces.Workspace", on_delete=models.CASCADE, related_name="dashboards")
    name       = models.CharField(max_length=100)
    widgets    = models.JSONField(default=list)   # [{id, type, title, config, position}]
    is_builtin = models.BooleanField(default=False)  # overview/analytics — non-deletable
    order      = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="dashboards")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return f"{self.workspace.name} / {self.name}"


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
