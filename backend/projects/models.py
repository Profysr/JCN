import re
import uuid
from django.db import models, transaction
from django.db.models import Count, Q
from django.conf import settings
from workspaces.models import Workspace
from core.constants import DEFAULT_TASK_STATUSES  # noqa: F401 — re-exported for existing imports
from core.fields import UUIDv7Field

class BoardQuerySet(models.QuerySet):
    def for_user(self, workspace, user):
        """
        Returns boards visible to the given user, fully loaded for list views.

        WHAT IT DOES
        ------------
        Combines three concerns into a single query:
          1. Eager-loads related data (created_by, statuses) to avoid N+1 queries
             when serializing a list of boards.
          2. Annotates each board with task_count and done_task_count so the
             progress bar on the board card works without extra queries.
          3. Enforces visibility — admins see every board; regular members only
             see public boards or private boards they were explicitly added to.

        WHY A CUSTOM QUERYSET (not a view-level filter)
        ------------------------------------------------
        Centralizing this in the model layer means every view that lists boards
        (board list, sidebar, search, etc.) gets identical, consistent behaviour
        by calling Board.objects.for_user(ws, user) instead of duplicating the
        visibility filter and annotations across multiple views.

        DB LOAD REDUCTION
        -----------------
        Without this method, a naive implementation would:
          - Fire 1 query per board to fetch its creator (N+1 on created_by)
          - Fire 1 query per board to fetch its statuses (N+1 on statuses)
          - Fire 1 query per board to count tasks and done tasks (2N extra queries)
        This method collapses all of that into 3 queries total regardless of how
        many boards are returned:
          - 1 main SELECT with COUNT annotations (task_count, done_task_count
            computed in DB, not Python)
          - 1 SELECT for created_by via select_related (JOIN, not extra query)
          - 1 SELECT for statuses via prefetch_related (single batched query)

        VISIBILITY RULES
        ----------------
        - Workspace owner and board.admin → unrestricted, see all boards.
        - Everyone else → public boards + private boards where they are a member.
          The Q(is_private=False) | Q(...board_members__user=user) OR condition
          can produce duplicate rows when a user is in board_members, so
          .distinct() is appended to deduplicate at the DB level.
        """
        qs = (
            self
            .select_related('created_by')
            .prefetch_related('statuses')
            .annotate(
                task_count=Count('tasks', distinct=True),
                done_task_count=Count(
                    'tasks',
                    filter=Q(tasks__status__is_done=True),
                    distinct=True,
                ),
            )
            .filter(workspace=workspace)
        )

        from workspaces.access import has_perm
        is_admin = (
            workspace.owner_id == user.pk
            or has_perm(user, workspace, "board.admin")
        )

        if is_admin:
            return qs

        return qs.filter(
            Q(is_private=False) | Q(is_private=True, board_members__user=user)
        ).distinct()


class Board(models.Model):
    """Top-level work container — one per team, client, department, or initiative."""

    PREFIX = "brd"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    class BoardType(models.TextChoices):
        SOFTWARE = "software", "Software"
        MARKETING = "marketing", "Marketing"
        OPERATIONS = "operations", "Operations"
        CLIENT = "client", "Client Project"
        HR = "hr", "HR & People"
        DESIGN = "design", "Design"
        GENERAL = "general", "General"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="boards"
    )
    name = models.CharField(max_length=255)
    key = models.CharField(max_length=6, blank=True, db_index=True)
    description = models.TextField(blank=True)
    board_type = models.CharField(
        max_length=20, choices=BoardType.choices, default=BoardType.GENERAL
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    is_private = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_boards",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = BoardQuerySet.as_manager()

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.workspace.name} / {self.name}"


class TaskStatus(models.Model):
    """Configurable workflow columns — each board defines its own."""

    PREFIX = "tst"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="statuses"
    )
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default="#6366f1")
    order = models.PositiveIntegerField(default=0)
    is_done = models.BooleanField(default=False)
    is_started = models.BooleanField(default=False)

    class Meta:
        ordering = ["order"]
        unique_together = ["board", "name"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"


class Task(models.Model):
    PREFIX = "tsk"

    class Priority(models.TextChoices):
        LOWEST = "lowest", "Lowest"
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        HIGHEST = "highest", "Highest"

    class TaskType(models.TextChoices):
        TASK = "task", "Task"
        BUG = "bug", "Bug"
        FEATURE = "feature", "Feature"
        STORY = "story", "Story"
        EPIC = "epic", "Epic"
        IMPROVEMENT = "improvement", "Improvement"
        QUESTION = "question", "Question"

    id = UUIDv7Field()
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="tasks")
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    status = models.ForeignKey(
        TaskStatus,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.MEDIUM
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_tasks",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_tasks",
    )
    task_type = models.CharField(
        max_length=20, choices=TaskType.choices, default=TaskType.TASK
    )
    labels = models.ManyToManyField("Label", blank=True, related_name="tasks")
    sprint = models.ForeignKey(
        "Sprint", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks"
    )
    due_date = models.DateField(null=True, blank=True)
    start_date = models.DateField(null=True, blank=True)
    estimate_points = models.PositiveIntegerField(null=True, blank=True)
    estimate_hours = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    order = models.PositiveIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["board", "status", "order"], name="task_board_status_order_idx"),
            models.Index(fields=["board", "assignee"], name="task_board_assignee_idx"),
            models.Index(fields=["board", "priority"], name="task_board_priority_idx"),
            models.Index(fields=["board", "sprint"], name="task_board_sprint_idx"),
            models.Index(fields=["assignee", "status"], name="task_assignee_status_idx"),
            models.Index(fields=["board", "due_date"], name="task_board_due_date_idx"),
        ]

    def __str__(self):
        return self.title

    @property
    def child_count(self):
        return self.children.count()

    @property
    def done_child_count(self):
        return self.children.filter(status__is_done=True).count()

    def clone(self, created_by):
        """Deep-clone this task (children + labels); strips assignee, dates, sprint."""
        new_task = Task.objects.create(
            board=self.board,
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
    PREFIX = "sub"
    id = UUIDv7Field()
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
    PREFIX = "cmt"
    id = UUIDv7Field()
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="task_comments"
    )
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="replies"
    )
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["task", "created_at"], name="comment_task_created_idx"),
        ]

    def __str__(self):
        return f"Comment by {self.author.email} on {self.task.title}"

class Label(models.Model):
    PREFIX = "lbl"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="labels"
    )
    name = models.CharField(max_length=50)
    color = models.CharField(max_length=7, default="#6366f1")

    class Meta:
        ordering = ["name"]
        unique_together = ["board", "name"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"

# Not being used at the moment ======================================
class BoardField(models.Model):
    """Custom field definition scoped to a board."""

    PREFIX = "bfl"

    class FieldType(models.TextChoices):
        TEXT = "text", "Text"
        NUMBER = "number", "Number"
        SELECT = "select", "Select"
        URL = "url", "URL"
        DATE = "date", "Date"

    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="fields"
    )
    name = models.CharField(max_length=100)
    type = models.CharField(
        max_length=20, choices=FieldType.choices, default=FieldType.TEXT
    )
    options = models.JSONField(default=list)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]
        unique_together = ["board", "name"]

    def __str__(self):
        return f"{self.board.name} / {self.name} ({self.type})"

class TaskFieldValue(models.Model):
    """Per-task value for a custom board field."""

    PREFIX = "pfv"
    id = UUIDv7Field()
    task = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="field_values"
    )
    field = models.ForeignKey(
        BoardField, on_delete=models.CASCADE, related_name="values"
    )
    value = models.TextField(blank=True)

    class Meta:
        unique_together = ["task", "field"]

    def __str__(self):
        return f"{self.task.title} / {self.field.name}: {self.value}"
# ==============================================

class SavedView(models.Model):
    """Named filter preset per board per user."""

    PREFIX = "svw"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="saved_views"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_views"
    )
    name = models.CharField(max_length=100)
    filters = models.JSONField(default=dict)
    is_workspace_scoped = models.BooleanField(default=False)
    alert_enabled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["board", "user", "name"]

    def __str__(self):
        return f"{self.board.name} / {self.user.email} / {self.name}"

class Sprint(models.Model):
    """Time-boxed work cycle per board."""

    PREFIX = "spr"

    class Status(models.TextChoices):
        PLANNING = "planning", "Planning"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"

    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="sprints"
    )
    name = models.CharField(max_length=255)
    goal = models.TextField(blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PLANNING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"


class TaskAttachment(models.Model):
    """File attached to a task."""

    PREFIX = "att"
    id = UUIDv7Field()
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="attachments")
    file = models.FileField(upload_to="task_attachments/%Y/%m/")
    original_name = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField()
    mime_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.original_name} on {self.task.title}"


class TaskDependency(models.Model):
    """Task relationships — blocks/blocked_by + extended relation types."""

    PREFIX = "dep"

    class RelationType(models.TextChoices):
        BLOCKS = "blocks", "Blocks"
        BLOCKED_BY = "blocked_by", "Blocked by"
        RELATES_TO = "relates_to", "Relates to"
        DUPLICATE_OF = "duplicate_of", "Duplicate of"
        CLONED_FROM = "cloned_from", "Cloned from"

    id = UUIDv7Field()
    blocker = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="blocking_deps"
    )
    blocked = models.ForeignKey(
        Task, on_delete=models.CASCADE, related_name="blocked_by_deps"
    )
    relation_type = models.CharField(
        max_length=20, choices=RelationType.choices, default=RelationType.BLOCKS
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["blocker", "blocked"]

    def __str__(self):
        return f"{self.blocker.title} {self.relation_type} {self.blocked.title}"


class TaskActivity(models.Model):
    """Immutable audit log — one row per event on a task."""

    PREFIX = "act"

    class Verb(models.TextChoices):
        CREATED = "created", "created the task"
        UPDATED = "updated", "updated the task"
        STATUS = "status_changed", "changed status"
        PRIORITY = "priority_changed", "changed priority"
        ASSIGNED = "assigned", "assigned the task"
        COMMENTED = "commented", "added a comment"
        SUBTASK = "subtask_added", "added a subtask"

    id = UUIDv7Field()
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="task_activities",
    )
    verb = models.CharField(max_length=30, choices=Verb.choices)
    meta = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["task", "created_at"], name="taskact_task_created_idx"),
        ]

    def __str__(self):
        return f"{self.actor} {self.verb} on {self.task}"


class BoardMember(models.Model):
    """Board-level role override — takes precedence over workspace role."""

    PREFIX = "bom"

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        EDITOR = "editor", "Editor"
        VIEWER = "viewer", "Viewer"

    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="board_members"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="board_memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.VIEWER)
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="added_board_members",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ["board", "user"]
        ordering = ["id"]

    def __str__(self):
        return f"{self.user.email} → {self.board.name} ({self.role})"

# Not being used =====================================
class TaskTemplate(models.Model):
    """Reusable task structure — pre-filled fields + default subtasks."""

    PREFIX = "ttm"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="task_templates"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    task_type = models.CharField(
        max_length=20, choices=Task.TaskType.choices, default=Task.TaskType.TASK
    )
    priority = models.CharField(
        max_length=20, choices=Task.Priority.choices, default=Task.Priority.MEDIUM
    )
    default_subtasks = models.JSONField(default=list)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_task_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        unique_together = ["board", "name"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"
# =====================================

class WikiPage(models.Model):
    """Board-scoped wiki page with parent hierarchy and version history."""

    PREFIX = "wkp"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="wiki_pages"
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255)
    content = models.TextField(blank=True)
    is_public = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_wiki_pages",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["order", "title"]
        unique_together = ["board", "slug"]

    def __str__(self):
        return f"{self.board.name} / {self.title}"


class WikiRevision(models.Model):
    """Immutable snapshot of a WikiPage at a point in time."""

    PREFIX = "wkr"
    id = UUIDv7Field()
    page = models.ForeignKey(
        WikiPage, on_delete=models.CASCADE, related_name="revisions"
    )
    content = models.TextField()
    title = models.CharField(max_length=255)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="wiki_revisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"Revision of {self.page.title} at {self.created_at}"


class Document(models.Model):
    """Workspace-scoped standalone document (meeting notes, specs, runbooks)."""

    PREFIX = "doc"
    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="documents"
    )
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_documents",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.workspace.name} / {self.title}"


class Form(models.Model):
    """Board-scoped intake form that creates tasks from submissions."""

    PREFIX = "frm"
    id = UUIDv7Field()
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name="forms")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    token = models.UUIDField(default=uuid.uuid4, unique=True)
    config = models.JSONField(default=dict)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_forms",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"


class FormField(models.Model):
    """A field inside an intake form."""

    PREFIX = "fff"

    class FieldType(models.TextChoices):
        SHORT_TEXT = "short_text", "Short Text"
        LONG_TEXT = "long_text", "Long Text"
        EMAIL = "email", "Email"
        NUMBER = "number", "Number"
        DROPDOWN = "dropdown", "Dropdown"
        MULTISELECT = "multiselect", "Multi-Select"
        DATE = "date", "Date"
        FILE = "file", "File Upload"

    id = UUIDv7Field()
    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="fields")
    label = models.CharField(max_length=255)
    field_type = models.CharField(
        max_length=20, choices=FieldType.choices, default=FieldType.SHORT_TEXT
    )
    placeholder = models.CharField(max_length=255, blank=True)
    is_required = models.BooleanField(default=False)
    options = models.JSONField(default=list)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"{self.form.name} / {self.label}"


class FormSubmission(models.Model):
    """A submitted form response, optionally linked to a created task."""

    PREFIX = "fsb"

    class Status(models.TextChoices):
        NEW = "new", "New"
        IN_REVIEW = "in_review", "In Review"
        CLOSED = "closed", "Closed"

    id = UUIDv7Field()
    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="submissions")
    answers = models.JSONField(default=dict)
    submitter_email = models.EmailField(blank=True)
    task = models.OneToOneField(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="from_submission",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at"]

    def __str__(self):
        return f"Submission to {self.form.name} at {self.submitted_at}"


class AutomationRule(models.Model):
    """No-code automation rule: when trigger + conditions → run actions."""

    PREFIX = "rul"
    id = UUIDv7Field()
    board = models.ForeignKey(
        Board, on_delete=models.CASCADE, related_name="automation_rules"
    )
    name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)
    fire_count = models.PositiveIntegerField(default=0)
    trigger = models.JSONField(default=dict)
    conditions = models.JSONField(default=list)
    actions = models.JSONField(default=list)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="automation_rules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    def __str__(self):
        return f"{self.board.name} / {self.name}"


class AutomationLog(models.Model):
    """Immutable execution record for each automation rule fire."""

    PREFIX = "alg"

    class ExecStatus(models.TextChoices):
        SUCCESS = "success", "Success"
        PARTIAL = "partial", "Partial"
        FAILED = "failed", "Failed"

    id = UUIDv7Field()
    rule = models.ForeignKey(
        AutomationRule, on_delete=models.CASCADE, related_name="logs"
    )
    task = models.ForeignKey(
        Task,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="automation_logs",
    )
    trigger_payload = models.JSONField(default=dict)
    actions_run = models.JSONField(default=list)
    exec_status = models.CharField(
        max_length=20, choices=ExecStatus.choices, default=ExecStatus.SUCCESS
    )
    error_message = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["rule", "exec_status"], name="automlog_rule_status_idx"),
            models.Index(fields=["rule", "created_at"], name="automlog_rule_created_idx"),
        ]

    def __str__(self):
        return f"{self.rule.name} → {self.exec_status} at {self.created_at}"



class Objective(models.Model):
    """A goal — workspace or board-scoped, optionally nested for org rollup."""

    PREFIX = "obj"

    class TimePeriod(models.TextChoices):
        Q1 = "q1", "Q1"
        Q2 = "q2", "Q2"
        Q3 = "q3", "Q3"
        Q4 = "q4", "Q4"
        ANNUAL = "annual", "Annual"
        CUSTOM = "custom", "Custom"

    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="objectives"
    )
    board = models.ForeignKey(
        Board,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="objectives",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="owned_objectives",
    )
    time_period = models.CharField(
        max_length=10, choices=TimePeriod.choices, default=TimePeriod.Q1
    )
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    @property
    def progress(self):
        krs = list(self.key_results.all())
        if not krs:
            return 0
        return round(sum(kr.progress for kr in krs) / len(krs))

    @property
    def confidence(self):
        from django.utils import timezone
        p = self.progress
        if not (self.start_date and self.end_date):
            return "on_track" if p >= 70 else "at_risk" if p >= 40 else "off_track"
        today = timezone.now().date()
        total_days = (self.end_date - self.start_date).days or 1
        elapsed_days = max(0, (today - self.start_date).days)
        expected = min(100, round(elapsed_days / total_days * 100))
        if p >= expected * 0.9:
            return "on_track"
        if p >= expected * 0.5:
            return "at_risk"
        return "off_track"

    def __str__(self):
        return self.title


class KeyResult(models.Model):
    """A measurable outcome under an Objective. Progress is task-driven."""

    PREFIX = "krs"
    id = UUIDv7Field()
    objective = models.ForeignKey(
        Objective, on_delete=models.CASCADE, related_name="key_results"
    )
    title = models.CharField(max_length=500)
    tasks = models.ManyToManyField(Task, blank=True, related_name="key_results")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["id"]

    @property
    def progress(self):
        total = self.tasks.count()
        if total == 0:
            return 0
        done = self.tasks.filter(status__is_done=True).count()
        return round(done / total * 100)

    def __str__(self):
        return f"{self.objective.title} / {self.title}"


class Approval(models.Model):
    """An approval request on a task — has one or more reviewers."""

    PREFIX = "apr"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CHANGES_REQUESTED = "changes_requested", "Changes Requested"

    id = UUIDv7Field()
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="approvals")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requested_approvals",
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.PENDING
    )
    due_date = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)
    overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name="approval_overrides",
    )
    override_comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-id"]

    def recompute_status(self):
        statuses = list(self.reviewers.values_list("status", flat=True))
        if not statuses:
            return
        if any(s == "rejected" for s in statuses):
            self.status = self.Status.REJECTED
        elif any(s == "changes_requested" for s in statuses):
            self.status = self.Status.CHANGES_REQUESTED
        elif all(s == "approved" for s in statuses):
            self.status = self.Status.APPROVED
        else:
            self.status = self.Status.PENDING
        self.save(update_fields=["status", "updated_at"])

    def __str__(self):
        return f"Approval for {self.task.title} ({self.status})"


class ApprovalReviewer(models.Model):
    """One reviewer's verdict on an Approval."""

    PREFIX = "arv"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CHANGES_REQUESTED = "changes_requested", "Changes Requested"

    id = UUIDv7Field()
    approval = models.ForeignKey(
        Approval, on_delete=models.CASCADE, related_name="reviewers"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="approval_reviews",
    )
    status = models.CharField(
        max_length=30, choices=Status.choices, default=Status.PENDING
    )
    comment = models.TextField(blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ["approval", "user"]
        ordering = ["reviewed_at"]

    def __str__(self):
        return f"{self.user.email} → {self.approval_id} ({self.status})"


class UserPresence(models.Model):
    """Tracks which resource a user is currently viewing (updated every 30s)."""

    PREFIX = "upr"

    class ResourceType(models.TextChoices):
        TASK = "task", "Task"
        BOARD = "board", "Board"

    id = UUIDv7Field()
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="presences"
    )
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="presences"
    )
    resource_type = models.CharField(max_length=20, choices=ResourceType.choices)
    resource_id = models.CharField(max_length=100)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ["user", "workspace", "resource_type", "resource_id"]

    def __str__(self):
        return f"{self.user.email} viewing {self.resource_type}:{self.resource_id}"


class CommentReaction(models.Model):
    """Emoji reaction on a task comment — max 1 of each emoji per user."""

    PREFIX = "rxn"
    id = UUIDv7Field()
    comment = models.ForeignKey(
        TaskComment, on_delete=models.CASCADE, related_name="reactions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comment_reactions",
    )
    emoji = models.CharField(max_length=10)

    class Meta:
        unique_together = ["comment", "user", "emoji"]

    def __str__(self):
        return f"{self.user.email} reacted {self.emoji} on comment {self.comment_id}"


class AuditEvent(models.Model):
    """Immutable log of permission-related changes."""

    PREFIX = "aud"
    id = UUIDv7Field()
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name="audit_events"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=64)
    resource_type = models.CharField(max_length=64)
    resource_id = models.CharField(max_length=100)
    before = models.JSONField(default=dict)
    after = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]
        indexes = [
            models.Index(fields=["workspace", "created_at"], name="ae_workspace_created_idx"),
            models.Index(fields=["workspace", "resource_type"], name="ae_workspace_restype_idx"),
        ]

    def __str__(self):
        return f"{self.actor} — {self.action} at {self.created_at}"
