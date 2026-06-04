from rest_framework import serializers
from django.utils import timezone
import datetime
from .models import (
    Project, TaskStatus, Task, SubTask, TaskComment, TaskActivity, Label,
    ProjectField, TaskFieldValue, SavedView, Sprint,
    TaskAttachment, TaskDependency, TaskTemplate,
    WikiPage, WikiRevision, Document,
    Form, FormField, FormSubmission,
    AutomationRule, AutomationLog,
    TimeEntry,
    ProjectMember, GuestToken,
    Board,
    Dashboard,
)
from accounts.serializers import UserSerializer



class TaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TaskStatus
        fields = ["id", "name", "color", "order", "is_done"]


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]


class ProjectFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectField
        fields = ["id", "name", "type", "options", "order"]


class TaskFieldValueSerializer(serializers.ModelSerializer):
    field = ProjectFieldSerializer(read_only=True)
    field_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = TaskFieldValue
        fields = ["id", "field", "field_id", "value"]

    def create(self, validated_data):
        obj, _ = TaskFieldValue.objects.update_or_create(
            task=validated_data["task"],
            field_id=validated_data["field_id"],
            defaults={"value": validated_data.get("value", "")},
        )
        return obj


class BoardSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Board
        fields = [
            "id", "name", "description", "board_type", "is_default",
            "visibility", "config", "order", "is_archived", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class DashboardSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Dashboard
        fields = ["id", "name", "widgets", "is_builtin", "order", "created_at", "updated_at"]
        read_only_fields = ["id", "is_builtin", "created_at", "updated_at"]




class SavedViewSerializer(serializers.ModelSerializer):
    board_id = serializers.UUIDField(allow_null=True, required=False)

    class Meta:
        model = SavedView
        fields = ["id", "name", "filters", "board_id", "is_workspace_scoped", "alert_enabled", "created_at"]
        read_only_fields = ["id", "created_at"]


class SprintSerializer(serializers.ModelSerializer):
    task_count     = serializers.SerializerMethodField()
    completed_count = serializers.SerializerMethodField()

    class Meta:
        model = Sprint
        fields = ["id", "name", "goal", "start_date", "end_date", "status", "task_count", "completed_count", "created_at"]
        read_only_fields = ["id", "created_at"]

    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_completed_count(self, obj):
        done = obj.project.statuses.order_by("-order").first()
        return obj.tasks.filter(status=done).count() if done else 0


class SubTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubTask
        fields = ["id", "title", "is_done", "order"]


class TaskCommentSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = TaskComment
        fields = ["id", "author", "body", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "created_at", "updated_at"]

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


class TaskActivitySerializer(serializers.ModelSerializer):
    actor = UserSerializer(read_only=True)

    class Meta:
        model = TaskActivity
        fields = ["id", "actor", "verb", "meta", "created_at"]


class TaskSerializer(serializers.ModelSerializer):
    assignee      = UserSerializer(read_only=True)
    assignee_id   = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    created_by    = UserSerializer(read_only=True)
    status_detail = TaskStatusSerializer(source="status", read_only=True)
    status_id     = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    labels        = LabelSerializer(many=True, read_only=True)
    label_ids     = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)
    sprint_id     = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    sprint_detail = SprintSerializer(source="sprint", read_only=True)
    parent_id     = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    parent_detail = serializers.SerializerMethodField()
    subtask_count      = serializers.SerializerMethodField()
    done_subtask_count = serializers.SerializerMethodField()
    comment_count      = serializers.SerializerMethodField()
    child_count        = serializers.SerializerMethodField()
    done_child_count   = serializers.SerializerMethodField()
    # v3.0.0 — lightweight dep IDs for Gantt dependency arrows (no extra request needed)
    blocked_by_ids     = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "priority", "task_type", "order",
            "due_date", "start_date", "estimate_points", "estimate_hours",
            "status_id", "status_detail",
            "assignee_id", "assignee",
            "labels", "label_ids",
            "sprint_id", "sprint_detail",
            "parent_id", "parent_detail",
            "created_by", "created_at", "updated_at",
            "subtask_count", "done_subtask_count", "comment_count",
            "child_count", "done_child_count",
            "blocked_by_ids",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_subtask_count(self, obj):      return obj.subtasks.count()
    def get_done_subtask_count(self, obj): return obj.subtasks.filter(is_done=True).count()
    def get_comment_count(self, obj):      return obj.comments.count()
    def get_child_count(self, obj):        return obj.children.count()
    def get_done_child_count(self, obj):   return obj.children.filter(status__is_done=True).count()
    def get_blocked_by_ids(self, obj):     return [str(d.blocker_id) for d in obj.blocked_by_deps.all()]

    def get_parent_detail(self, obj):
        if obj.parent_id:
            return {"id": str(obj.parent.id), "title": obj.parent.title, "task_type": obj.parent.task_type}
        return None

    def create(self, validated_data):
        label_ids = validated_data.pop("label_ids", [])
        validated_data["created_by"] = self.context["request"].user
        task = super().create(validated_data)
        if label_ids:
            task.labels.set(label_ids)
        return task

    def update(self, instance, validated_data):
        label_ids = validated_data.pop("label_ids", None)
        instance = super().update(instance, validated_data)
        if label_ids is not None:
            instance.labels.set(label_ids)
        return instance


class MyWorkTaskSerializer(TaskSerializer):
    """Extends TaskSerializer with project + workspace info needed for navigation."""
    project_id     = serializers.SerializerMethodField()
    project_name   = serializers.SerializerMethodField()
    workspace_slug = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + ["project_id", "project_name", "workspace_slug"]

    def get_project_id(self, obj):     return str(obj.project.id)
    def get_project_name(self, obj):   return obj.project.name
    def get_workspace_slug(self, obj): return obj.project.workspace.slug


class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by  = UserSerializer(read_only=True)
    url          = serializers.SerializerMethodField()

    class Meta:
        model  = TaskAttachment
        fields = ["id", "original_name", "file_size", "mime_type", "url", "uploaded_by", "created_at"]

    def get_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class MinimalTaskSerializer(serializers.ModelSerializer):
    status_detail = TaskStatusSerializer(source="status", read_only=True)

    class Meta:
        model  = Task
        fields = ["id", "title", "priority", "task_type", "status_detail"]


class TaskDependencySerializer(serializers.ModelSerializer):
    task = MinimalTaskSerializer(read_only=True)

    class Meta:
        model  = TaskDependency
        fields = ["id", "task", "relation_type"]


class TaskTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model  = TaskTemplate
        fields = ["id", "name", "description", "task_type", "priority", "default_subtasks", "created_at"]
        read_only_fields = ["id", "created_at"]


class TaskDetailSerializer(TaskSerializer):
    subtasks      = SubTaskSerializer(many=True, read_only=True)
    comments      = TaskCommentSerializer(many=True, read_only=True)
    activities    = TaskActivitySerializer(many=True, read_only=True)
    field_values  = TaskFieldValueSerializer(many=True, read_only=True)
    attachments   = TaskAttachmentSerializer(many=True, read_only=True)
    children      = serializers.SerializerMethodField()
    ancestors     = serializers.SerializerMethodField()
    blocked_by    = serializers.SerializerMethodField()
    blocking      = serializers.SerializerMethodField()
    relations     = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + [
            "subtasks", "comments", "activities", "field_values",
            "attachments", "children", "ancestors", "blocked_by", "blocking", "relations",
        ]

    def get_children(self, obj):
        return MinimalTaskSerializer(obj.children.select_related("status").all(), many=True).data

    def get_ancestors(self, obj):
        """Walk up the parent chain and return ordered list [root, ..., direct_parent]."""
        chain, current = [], obj.parent
        while current:
            chain.append({"id": str(current.id), "title": current.title, "task_type": current.task_type})
            current = current.parent
        return list(reversed(chain))

    def get_blocked_by(self, obj):
        deps = obj.blocked_by_deps.filter(relation_type=TaskDependency.RelationType.BLOCKS).select_related("blocker__status")
        return [{"id": str(d.id), "task": MinimalTaskSerializer(d.blocker).data} for d in deps]

    def get_blocking(self, obj):
        deps = obj.blocking_deps.filter(relation_type=TaskDependency.RelationType.BLOCKS).select_related("blocked__status")
        return [{"id": str(d.id), "task": MinimalTaskSerializer(d.blocked).data} for d in deps]

    def get_relations(self, obj):
        """Non-blocking relations: relates_to, duplicate_of, cloned_from."""
        non_block = [TaskDependency.RelationType.RELATES_TO, TaskDependency.RelationType.DUPLICATE_OF, TaskDependency.RelationType.CLONED_FROM]
        result = []
        for dep in obj.blocking_deps.filter(relation_type__in=non_block).select_related("blocked__status"):
            result.append({"id": str(dep.id), "relation_type": dep.relation_type, "task": MinimalTaskSerializer(dep.blocked).data})
        for dep in obj.blocked_by_deps.filter(relation_type__in=non_block).select_related("blocker__status"):
            result.append({"id": str(dep.id), "relation_type": dep.relation_type, "task": MinimalTaskSerializer(dep.blocker).data})
        return result


class TaskSearchSerializer(serializers.ModelSerializer):
    workspace_slug = serializers.SerializerMethodField()
    project_id     = serializers.SerializerMethodField()
    project_name   = serializers.CharField(source="project.name", read_only=True)
    status_name    = serializers.SerializerMethodField()
    assignee_name  = serializers.SerializerMethodField()
    due_date       = serializers.DateField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id", "title", "priority", "task_type",
            "workspace_slug", "project_id", "project_name",
            "status_name", "assignee_name", "due_date",
        ]

    def get_workspace_slug(self, obj): return obj.project.workspace.slug
    def get_project_id(self, obj):     return str(obj.project.id)
    def get_status_name(self, obj):    return obj.status.name if obj.status else None
    def get_assignee_name(self, obj):  return obj.assignee.full_name or obj.assignee.email if obj.assignee else None


class ProjectSearchSerializer(serializers.ModelSerializer):
    workspace_slug = serializers.CharField(source="workspace.slug", read_only=True)
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = Project
        fields = ["id", "name", "workspace_slug", "workspace_name"]


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.UUIDField(write_only=True)

    class Meta:
        model  = ProjectMember
        fields = ["id", "user", "user_id", "role", "created_at"]
        read_only_fields = ["id", "created_at"]

    def validate_user_id(self, value):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(pk=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")

    def create(self, validated_data):
        user = validated_data.pop("user_id")
        return ProjectMember.objects.create(user=user, **validated_data)


class GuestTokenSerializer(serializers.ModelSerializer):
    is_expired = serializers.SerializerMethodField()
    days = serializers.IntegerField(write_only=True, default=30)

    class Meta:
        model  = GuestToken
        fields = ["id", "token", "label", "expires_at", "is_active", "is_expired", "created_at", "days"]
        read_only_fields = ["id", "token", "expires_at", "is_expired", "created_at"]

    def get_is_expired(self, obj):
        return obj.is_expired()

    def create(self, validated_data):
        days = validated_data.pop("days", 30)
        validated_data["expires_at"] = timezone.now() + datetime.timedelta(days=days)
        return GuestToken.objects.create(**validated_data)


class ProjectSerializer(serializers.ModelSerializer):
    created_by      = UserSerializer(read_only=True)
    statuses        = TaskStatusSerializer(many=True, read_only=True)
    task_count      = serializers.SerializerMethodField()
    done_task_count = serializers.SerializerMethodField()
    my_role         = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ["id", "name", "description", "status", "is_private", "created_by", "statuses",
                  "task_count", "done_task_count", "my_role", "created_at", "updated_at"]
        read_only_fields = ["id", "created_by", "statuses", "created_at", "updated_at"]

    def get_task_count(self, obj):
        return obj.tasks.count()

    def get_done_task_count(self, obj):
        done_statuses = obj.statuses.filter(is_done=True)
        if done_statuses.exists():
            return obj.tasks.filter(status__in=done_statuses).count()
        last = obj.statuses.order_by("-order").first()
        return obj.tasks.filter(status=last).count() if last else 0

    def get_my_role(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        from .permissions import get_effective_role
        return get_effective_role(request.user, obj)

    def create(self, validated_data):
        request   = self.context["request"]
        workspace = self.context["workspace"]
        project   = Project.objects.create(workspace=workspace, created_by=request.user, **validated_data)
        TaskStatus.objects.bulk_create([
            TaskStatus(project=project, **s) for s in [
                {"name": "Backlog",     "color": "#94a3b8", "order": 0, "is_done": False},
                {"name": "In Progress", "color": "#6366f1", "order": 1, "is_done": False},
                {"name": "In Review",   "color": "#f59e0b", "order": 2, "is_done": False},
                {"name": "Done",        "color": "#22c55e", "order": 3, "is_done": True},
            ]
        ])
        # Auto-create default board (v2.2.0)
        Board.objects.create(
            project=project,
            name="Main Board",
            board_type=Board.BoardType.KANBAN,
            is_default=True,
            visibility=Board.Visibility.PUBLIC,
            created_by=request.user,
            order=0,
        )
        return project


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────

class WikiRevisionSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model  = WikiRevision
        fields = ["id", "title", "content", "author", "created_at"]
        read_only_fields = ["id", "author", "created_at"]


class WikiPageSerializer(serializers.ModelSerializer):
    created_by     = UserSerializer(read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model  = WikiPage
        fields = ["id", "title", "slug", "content", "is_public", "order",
                  "parent", "created_by", "children_count", "created_at", "updated_at"]
        # slug is always auto-generated from title — never required from the client
        read_only_fields = ["id", "slug", "created_by", "created_at", "updated_at"]

    def get_children_count(self, obj):
        return obj.children.count()

    def create(self, validated_data):
        from django.utils.text import slugify
        import uuid as _uuid
        title = validated_data.get("title", "")
        base_slug = slugify(title) or str(_uuid.uuid4())[:8]
        project = validated_data["project"]
        slug = base_slug
        counter = 1
        while WikiPage.objects.filter(project=project, slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        validated_data["slug"] = slug
        return super().create(validated_data)


class DocumentSerializer(serializers.ModelSerializer):
    created_by = UserSerializer(read_only=True)

    class Meta:
        model  = Document
        fields = ["id", "title", "content", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────

class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FormField
        fields = ["id", "label", "field_type", "placeholder", "is_required", "options", "order"]
        read_only_fields = ["id"]


class FormSerializer(serializers.ModelSerializer):
    fields    = FormFieldSerializer(many=True, read_only=True)
    created_by = UserSerializer(read_only=True)
    submission_count = serializers.SerializerMethodField()

    class Meta:
        model  = Form
        fields = ["id", "name", "description", "is_active", "token", "config",
                  "fields", "created_by", "submission_count", "created_at", "updated_at"]
        read_only_fields = ["id", "token", "created_by", "created_at", "updated_at"]

    def get_submission_count(self, obj):
        return obj.submissions.count()


class FormSubmissionSerializer(serializers.ModelSerializer):
    task_title = serializers.SerializerMethodField()

    class Meta:
        model  = FormSubmission
        fields = ["id", "answers", "submitter_email", "task", "task_title", "status", "submitted_at"]
        read_only_fields = ["id", "task", "submitted_at"]

    def get_task_title(self, obj):
        return obj.task.title if obj.task else None


class PublicFormSerializer(serializers.ModelSerializer):
    """Stripped-down serializer for unauthenticated public form view."""
    fields = FormFieldSerializer(many=True, read_only=True)

    class Meta:
        model  = Form
        fields = ["id", "name", "description", "config", "fields"]


# ── v2.7.0 — Automation ───────────────────────────────────────────────────────

class AutomationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model  = AutomationLog
        fields = ["id", "trigger_payload", "actions_run", "exec_status", "error_message", "duration_ms", "created_at"]
        read_only_fields = ["id", "created_at"]


class AutomationRuleSerializer(serializers.ModelSerializer):
    logs_preview = serializers.SerializerMethodField()

    class Meta:
        model  = AutomationRule
        fields = ["id", "name", "is_active", "fire_count", "trigger", "conditions", "actions",
                  "logs_preview", "created_at", "updated_at"]
        read_only_fields = ["id", "fire_count", "created_at", "updated_at"]

    def get_logs_preview(self, obj):
        recent = obj.logs.order_by("-created_at")[:5]
        return AutomationLogSerializer(recent, many=True).data


# ── v2.8.0 — Time Tracking ────────────────────────────────────────────────────

class TimeEntrySerializer(serializers.ModelSerializer):
    user       = UserSerializer(read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    is_running = serializers.SerializerMethodField()

    class Meta:
        model  = TimeEntry
        fields = [
            "id", "task", "task_title", "user", "description",
            "start_at", "end_at", "duration_seconds",
            "is_billable", "is_running", "created_at",
        ]
        read_only_fields = ["id", "user", "start_at", "end_at", "duration_seconds", "created_at"]

    def get_is_running(self, obj):
        return obj.is_running
