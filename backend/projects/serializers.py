from rest_framework import serializers
from django.utils import timezone
import datetime
from .models import (
    Project, TaskStatus, Task, SubTask, TaskComment, TaskActivity, Label,
    ProjectField, TaskFieldValue, SavedView, Sprint,
    TaskAttachment, TaskDependency,
    ProjectMember, GuestToken,
    Board,
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


class SavedViewSerializer(serializers.ModelSerializer):
    board_id = serializers.UUIDField(allow_null=True, required=False)

    class Meta:
        model = SavedView
        fields = ["id", "name", "filters", "board_id", "created_at"]
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
    subtask_count      = serializers.SerializerMethodField()
    done_subtask_count = serializers.SerializerMethodField()
    comment_count      = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id", "title", "description", "priority", "task_type", "order", "due_date",
            "status_id", "status_detail",
            "assignee_id", "assignee",
            "labels", "label_ids",
            "sprint_id", "sprint_detail",
            "created_by", "created_at", "updated_at",
            "subtask_count", "done_subtask_count", "comment_count",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_subtask_count(self, obj):      return obj.subtasks.count()
    def get_done_subtask_count(self, obj): return obj.subtasks.filter(is_done=True).count()
    def get_comment_count(self, obj):      return obj.comments.count()

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
        fields = ["id", "title", "priority", "status_detail"]


class TaskDependencySerializer(serializers.ModelSerializer):
    task = MinimalTaskSerializer(read_only=True)

    class Meta:
        model  = TaskDependency
        fields = ["id", "task"]


class TaskDetailSerializer(TaskSerializer):
    subtasks      = SubTaskSerializer(many=True, read_only=True)
    comments      = TaskCommentSerializer(many=True, read_only=True)
    activities    = TaskActivitySerializer(many=True, read_only=True)
    field_values  = TaskFieldValueSerializer(many=True, read_only=True)
    attachments   = TaskAttachmentSerializer(many=True, read_only=True)
    blocked_by    = serializers.SerializerMethodField()
    blocking      = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + [
            "subtasks", "comments", "activities", "field_values",
            "attachments", "blocked_by", "blocking",
        ]

    def get_blocked_by(self, obj):
        deps = obj.blocked_by_deps.select_related("blocker__status")
        return [{"id": str(d.id), "task": MinimalTaskSerializer(d.blocker).data} for d in deps]

    def get_blocking(self, obj):
        deps = obj.blocking_deps.select_related("blocked__status")
        return [{"id": str(d.id), "task": MinimalTaskSerializer(d.blocked).data} for d in deps]


class TaskSearchSerializer(serializers.ModelSerializer):
    workspace_slug = serializers.SerializerMethodField()
    project_id     = serializers.SerializerMethodField()
    project_name   = serializers.CharField(source="project.name", read_only=True)
    status_name    = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ["id", "title", "priority", "workspace_slug", "project_id", "project_name", "status_name"]

    def get_workspace_slug(self, obj): return obj.project.workspace.slug
    def get_project_id(self, obj):     return str(obj.project.id)
    def get_status_name(self, obj):    return obj.status.name if obj.status else None


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
