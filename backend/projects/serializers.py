from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied
from django.utils import timezone
import datetime
from core.constants import DEFAULT_TASK_STATUSES

from .models import (
    Board,
    TaskStatus,
    Task,
    SubTask,
    TaskComment,
    TaskActivity,
    Label,
    BoardField,
    TaskFieldValue,
    SavedView,
    Sprint,
    TaskAttachment,
    TaskDependency,
    TaskTemplate,
    WikiPage,
    WikiRevision,
    Document,
    Form,
    FormField,
    FormSubmission,
    AutomationRule,
    AutomationLog,
    BoardMember,
    UserPresence,
    CommentReaction,
    Approval,
    ApprovalReviewer,
    Objective,
    KeyResult,
)
from accounts.serializers import MiniUserSerializer


class TaskStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskStatus
        fields = ["id", "name", "color", "order", "is_done", "is_started"]


class MiniTaskStatusSerializer(serializers.ModelSerializer):
    """
    Display-only status (id, name, color) for embedding in task payloads.

    Omits order/is_done/is_started — board logic (column ordering, done
    detection) reads those from the dedicated `/statuses/` endpoint, never from
    a task's embedded status. Dropping them here trims every task row in lists,
    detail, and analytics drill-downs.
    """

    class Meta:
        model = TaskStatus
        fields = ["id", "name", "color"]
        read_only_fields = fields


class ChildTaskSerializer(serializers.ModelSerializer):
    """Minimal read-only payload for the /children/ list.

    Only the fields the UI actually renders: title, done flag, and the
    status colour/name for the dot and badge. Everything else (description,
    labels, estimates, sprints, counts…) is dropped to minimise wire size.
    """

    status_detail = MiniTaskStatusSerializer(source="status", read_only=True)
    is_done = serializers.BooleanField(
        source="status.is_done", read_only=True, default=False
    )

    class Meta:
        model = Task
        fields = ["id", "title", "is_done", "status_detail"]
        read_only_fields = fields


class BulkStatusItemSerializer(serializers.Serializer):
    # id is optional — omitted for new statuses, present for existing ones
    id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    name = serializers.CharField(max_length=100)
    color = serializers.CharField(max_length=20, default="#6366f1")
    is_done = serializers.BooleanField(default=False)
    is_started = serializers.BooleanField(default=False)


class BulkStatusUpdateSerializer(serializers.Serializer):
    statuses = BulkStatusItemSerializer(many=True)

    def validate_statuses(self, items):
        if not items:
            raise serializers.ValidationError("At least one status is required.")

        # Enforce single-done: keep only the last item marked is_done
        done_indices = [i for i, item in enumerate(items) if item.get("is_done")]
        for i in done_indices[:-1]:
            items[i]["is_done"] = False

        return items


class BulkTaskUpdatesSerializer(serializers.Serializer):
    """Permitted field overrides for a bulk update. All fields are optional."""
    status_id   = serializers.UUIDField(required=False, allow_null=True)
    priority    = serializers.CharField(required=False, allow_null=True)
    assignee_id = serializers.UUIDField(required=False, allow_null=True)


class TaskBulkActionSerializer(serializers.Serializer):
    task_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    action   = serializers.ChoiceField(choices=["update", "delete"])
    updates  = BulkTaskUpdatesSerializer(required=False, default=dict)


class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ["id", "name", "color"]

# ‼️Not being used anywhere at the moment
class BoardFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = BoardField
        fields = ["id", "name", "type", "options", "order"]


class TaskFieldValueSerializer(serializers.ModelSerializer):
    field = BoardFieldSerializer(read_only=True)
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

# ====================================
class BoardMiniSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField()
    done_task_count = serializers.IntegerField()

    class Meta:
        model = Board
        fields = [
            "id",
            "name",
            "description",
            "board_type",
            "is_private",
            "task_count",
            "done_task_count",
            "created_at",
        ]


class PortfolioBoardSerializer(serializers.ModelSerializer):
    task_count = serializers.IntegerField()
    done_task_count = serializers.IntegerField()
    overdue_tasks = serializers.IntegerField()
    completion_pct = serializers.SerializerMethodField()
    health = serializers.SerializerMethodField()
    active_sprints = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = [
            "id",
            "name",
            "board_type",
            "status",
            "is_private",
            "task_count",
            "done_task_count",
            "overdue_tasks",
            "completion_pct",
            "health",
            "active_sprints",
        ]

    def get_completion_pct(self, obj):
        return (
            round(obj.done_task_count / obj.task_count * 100) if obj.task_count else 0
        )

    def get_health(self, obj):
        overdue_pct = (
            (obj.overdue_tasks / obj.task_count * 100) if obj.task_count else 0
        )
        if overdue_pct > 25:
            return "off_track"
        if overdue_pct > 10:
            return "at_risk"
        return "on_track"

    def get_active_sprints(self, obj):
        return [
            {
                "id": str(s.id),
                "name": s.name,
                "start_date": s.start_date,
                "end_date": s.end_date,
            }
            for s in obj.active_sprints
        ]


class BoardSerializer(serializers.ModelSerializer):
    created_by = MiniUserSerializer(read_only=True)
    task_count = serializers.SerializerMethodField()
    done_task_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Board
        fields = [
            "id",
            "name",
            "description",
            "board_type",
            "status",
            "is_private",
            "created_by",
            "task_count",
            "done_task_count",
            "my_role",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]

    def get_task_count(self, obj):
        return obj.task_count

    def get_done_task_count(self, obj):
        return obj.done_task_count

    def get_my_role(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        from .permissions import get_effective_role

        return get_effective_role(request.user, obj)

    def create(self, validated_data):
        workspace = self.context["workspace"]
        user = self.context["request"].user
        board = Board.objects.create(
            workspace=workspace,
            created_by=user,
            **validated_data,
        )
        TaskStatus.objects.bulk_create(
            [TaskStatus(board=board, **s) for s in DEFAULT_TASK_STATUSES]
        )
        # BoardMember.objects.create(board=board, user=user, role=BoardMember.Role.ADMIN)
        return board


class SavedViewSerializer(serializers.ModelSerializer):
    board_id = serializers.UUIDField(allow_null=True, required=False)

    class Meta:
        model = SavedView
        fields = [
            "id",
            "name",
            "filters",
            "board_id",
            "is_workspace_scoped",
            "alert_enabled",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SprintListSerializer(serializers.ModelSerializer):
    """Minimal projection used by the list endpoint — just enough for the header/dropdown."""
    task_count = serializers.IntegerField(read_only=True, default=0)
    completed_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Sprint
        fields = [
            "id",
            "name",
            "status",
            "start_date",
            "end_date",
            "task_count",
            "completed_count",
        ]
        read_only_fields = ["id"]


class SprintSerializer(serializers.ModelSerializer):
    """Full detail serializer — used by the detail endpoint and write operations."""
    task_count = serializers.IntegerField(read_only=True, default=0)
    completed_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Sprint
        fields = [
            "id",
            "name",
            "goal",
            "start_date",
            "end_date",
            "status",
            "task_count",
            "completed_count",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MiniSprintSerializer(serializers.ModelSerializer):
    """Minimal sprint projection embedded in task serializers — id + name + dates only."""

    class Meta:
        model = Sprint
        fields = ["id", "name", "start_date", "end_date"]


class SubTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubTask
        fields = ["id", "title", "is_done", "order"]


def _group_reactions(reactions):
    """Turn a prefetched reactions queryset into {emoji: [{id, user_id, name}]}."""
    grouped = {}
    for r in reactions:
        grouped.setdefault(r.emoji, []).append(
            {"id": str(r.id), "user_id": str(r.user_id), "name": r.user.full_name or r.user.email}
        )
    return grouped


def _get_reactions_cached(obj):
    """
    Check Redis first; fall back to the prefetch cache and populate Redis.
    Redis hit = zero DB or Python work. Cold = one prefetch read + Redis write.
    """
    from .cache import get_reactions as cache_get, set_reactions as cache_set

    cached = cache_get(obj.id)
    if cached is not None:
        return cached
    grouped = _group_reactions(obj.reactions.all())
    cache_set(obj.id, grouped)
    return grouped


class TaskCommentReplySerializer(serializers.ModelSerializer):
    """Flat serializer for replies — no nested replies field to prevent recursion."""

    author = MiniUserSerializer(read_only=True)
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = TaskComment
        fields = ["id", "author", "parent_id", "body", "reactions", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "reactions", "created_at", "updated_at"]

    def get_reactions(self, obj):
        return _get_reactions_cached(obj)

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


class TaskCommentSerializer(serializers.ModelSerializer):
    author = MiniUserSerializer(read_only=True)
    reactions = serializers.SerializerMethodField()
    replies = TaskCommentReplySerializer(many=True, read_only=True)
    parent_id = serializers.UUIDField(required=False, allow_null=True, write_only=True)

    class Meta:
        model = TaskComment
        fields = ["id", "author", "parent_id", "body", "reactions", "replies", "created_at", "updated_at"]
        read_only_fields = ["id", "author", "reactions", "replies", "created_at", "updated_at"]

    def get_reactions(self, obj):
        return _get_reactions_cached(obj)

    def create(self, validated_data):
        validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


class CommentReactionSerializer(serializers.ModelSerializer):
    user = MiniUserSerializer(read_only=True)

    class Meta:
        model = CommentReaction
        fields = ["id", "user", "emoji"]


class UserPresenceSerializer(serializers.ModelSerializer):
    user = MiniUserSerializer(read_only=True)

    class Meta:
        model = UserPresence
        fields = ["id", "user", "resource_type", "resource_id", "last_seen"]


class TaskActivitySerializer(serializers.ModelSerializer):
    actor = MiniUserSerializer(read_only=True)

    class Meta:
        model = TaskActivity
        fields = ["id", "actor", "verb", "meta", "created_at"]


class TaskSerializer(serializers.ModelSerializer):
    assignee = MiniUserSerializer(read_only=True)
    assignee_id = serializers.UUIDField(
        write_only=True, required=False, allow_null=True
    )
    created_by = MiniUserSerializer(read_only=True)
    status_detail = MiniTaskStatusSerializer(source="status", read_only=True)
    status_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    labels = LabelSerializer(many=True, read_only=True)
    label_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )
    sprint_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    sprint_detail = MiniSprintSerializer(source="sprint", read_only=True)
    parent_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    parent_detail = serializers.SerializerMethodField()
    subtask_count = serializers.SerializerMethodField()
    done_subtask_count = serializers.SerializerMethodField()
    comment_count = serializers.SerializerMethodField()
    child_count = serializers.SerializerMethodField()
    done_child_count = serializers.SerializerMethodField()
    # v3.0.0 — lightweight dep IDs for Gantt dependency arrows (no extra request needed)
    blocked_by_ids = serializers.SerializerMethodField()
    # v3.6.0 — approval badge counts
    pending_approval_count = serializers.SerializerMethodField()
    approved_approval_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "priority",
            "task_type",
            "order",
            "due_date",
            "start_date",
            "estimate_points",
            "estimate_hours",
            "status_id",
            "status_detail",
            "assignee_id",
            "assignee",
            "labels",
            "label_ids",
            "sprint_id",
            "sprint_detail",
            "parent_id",
            "parent_detail",
            "created_by",
            "created_at",
            "updated_at",
            "subtask_count",
            "done_subtask_count",
            "comment_count",
            "child_count",
            "done_child_count",
            "blocked_by_ids",
            "version",
            "pending_approval_count",
            "approved_approval_count",
        ]
        read_only_fields = ["id", "created_by", "created_at", "updated_at", "version"]

    def get_subtask_count(self, obj):
        return getattr(obj, "_subtask_count", obj.subtasks.count())

    def get_done_subtask_count(self, obj):
        return getattr(
            obj, "_done_subtask_count", obj.subtasks.filter(is_done=True).count()
        )

    def get_comment_count(self, obj):
        return getattr(obj, "_comment_count", obj.comments.count())

    def get_child_count(self, obj):
        return getattr(obj, "_child_count", obj.children.count())

    def get_done_child_count(self, obj):
        return getattr(obj, "_done_child_count", obj.children.filter(status__is_done=True).count())

    def get_blocked_by_ids(self, obj):
        return [str(d.blocker_id) for d in obj.blocked_by_deps.all()]

    def get_pending_approval_count(self, obj):
        return getattr(
            obj,
            "_pending_approval_count",
            obj.approvals.filter(status__in=["pending", "changes_requested"]).count(),
        )

    def get_approved_approval_count(self, obj):
        return getattr(
            obj,
            "_approved_approval_count",
            obj.approvals.filter(status="approved").count(),
        )

    def get_parent_detail(self, obj):
        if obj.parent_id:
            return {
                "id": str(obj.parent.id),
                "title": obj.parent.title,
                "task_type": obj.parent.task_type,
            }
        return None

    def validate(self, data):
        # Resolve effective start/due dates, falling back to the existing
        # instance values so partial (PATCH) updates of one field still
        # validate against the other.
        start = data.get("start_date", getattr(self.instance, "start_date", None))
        due = data.get("due_date", getattr(self.instance, "due_date", None))
        if start and due and start > due:
            raise serializers.ValidationError(
                {"start_date": "Start date cannot be after the due date."}
            )
        return data

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


class TaskCardSerializer(serializers.ModelSerializer):
    """Slim read-only serializer for task list/Kanban endpoints.

    Drops fields only needed in the detail drawer (description, created_by,
    created_at, updated_at, estimate_*, sprint_detail, parent_detail,
    child_count, done_child_count, blocked_by_ids) to cut wire payload.
    Count fields read from DB-level annotations set by _task_list_qs().
    """

    assignee = MiniUserSerializer(read_only=True)
    label_ids = serializers.PrimaryKeyRelatedField(many=True, read_only=True, source="labels")
    subtask_count = serializers.SerializerMethodField()
    done_subtask_count = serializers.SerializerMethodField()
    pending_approval_count = serializers.SerializerMethodField()
    approved_approval_count = serializers.SerializerMethodField()
    child_count = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "board_id",
            "title",
            "priority",
            "task_type",
            "order",
            "due_date",
            "start_date",
            "status_id",
            # "assignee_id",
            "assignee",
            "label_ids",
            "sprint_id",
            "parent_id",
            "subtask_count",
            "done_subtask_count",
            "pending_approval_count",
            "approved_approval_count",
            "child_count",
            # "version",
        ]
        read_only_fields = fields

    def get_subtask_count(self, obj):
        return getattr(obj, "_subtask_count", obj.subtasks.count())

    def get_child_count(self, obj):
        return getattr(obj, "_child_count", obj.children.count())

    def get_done_subtask_count(self, obj):
        return getattr(
            obj, "_done_subtask_count", obj.subtasks.filter(is_done=True).count()
        )

    def get_pending_approval_count(self, obj):
        return getattr(
            obj,
            "_pending_approval_count",
            obj.approvals.filter(status__in=["pending", "changes_requested"]).count(),
        )

    def get_approved_approval_count(self, obj):
        return getattr(
            obj,
            "_approved_approval_count",
            obj.approvals.filter(status="approved").count(),
        )


class MyWorkTaskSerializer(TaskSerializer):
    """Extends TaskSerializer with board + workspace info needed for navigation."""

    board_id = serializers.SerializerMethodField()
    board_name = serializers.SerializerMethodField()
    workspace_id = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + ["board_id", "board_name", "workspace_id"]

    def get_board_id(self, obj):
        return str(obj.board.id)

    def get_board_name(self, obj):
        return obj.board.name

    def get_workspace_id(self, obj):
        return str(obj.board.workspace.id)


class TaskAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = MiniUserSerializer(read_only=True)
    url = serializers.SerializerMethodField()

    class Meta:
        model = TaskAttachment
        fields = [
            "id",
            "original_name",
            "file_size",
            "mime_type",
            "url",
            "uploaded_by",
            "created_at",
        ]

    def get_url(self, obj):
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(obj.file.url)
        return obj.file.url


class MinimalTaskSerializer(serializers.ModelSerializer):
    status_detail = MiniTaskStatusSerializer(source="status", read_only=True)

    class Meta:
        model = Task
        fields = ["id", "title", "priority", "task_type", "status_detail"]


class TaskDependencySerializer(serializers.ModelSerializer):
    task = MinimalTaskSerializer(read_only=True)

    class Meta:
        model = TaskDependency
        fields = ["id", "task", "relation_type"]


class TaskTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskTemplate
        fields = [
            "id",
            "name",
            "description",
            "task_type",
            "priority",
            "default_subtasks",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class TaskDetailSerializer(TaskSerializer):
    field_values = TaskFieldValueSerializer(many=True, read_only=True)
    ancestors = serializers.SerializerMethodField()
    key_result_links = serializers.SerializerMethodField()

    class Meta(TaskSerializer.Meta):
        fields = TaskSerializer.Meta.fields + [
            "field_values",
            "ancestors",
            "key_result_links",
        ]

    def get_ancestors(self, obj):
        """Walk up the parent chain and return ordered list [root, ..., direct_parent]."""
        chain, current = [], obj.parent
        while current:
            chain.append(
                {
                    "id": str(current.id),
                    "title": current.title,
                    "task_type": current.task_type,
                }
            )
            current = current.parent
        return list(reversed(chain))

    def get_key_result_links(self, obj):
        return [
            {"id": str(kr.id), "title": kr.title, "objective_title": kr.objective.title}
            for kr in obj.key_results.select_related("objective").all()
        ]


class TaskSearchSerializer(serializers.ModelSerializer):
    workspace_id = serializers.SerializerMethodField()
    board_id = serializers.SerializerMethodField()
    board_name = serializers.CharField(source="board.name", read_only=True)
    status_name = serializers.SerializerMethodField()
    assignee_name = serializers.SerializerMethodField()
    due_date = serializers.DateField(read_only=True)

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "priority",
            "task_type",
            "workspace_id",
            "board_id",
            "board_name",
            "status_name",
            "assignee_name",
            "due_date",
        ]

    def get_workspace_id(self, obj):
        return str(obj.board.workspace.id)

    def get_board_id(self, obj):
        return str(obj.board.id)

    def get_status_name(self, obj):
        return obj.status.name if obj.status else None

    def get_assignee_name(self, obj):
        return obj.assignee.full_name or obj.assignee.email if obj.assignee else None


class BoardSearchSerializer(serializers.ModelSerializer):
    workspace_id = serializers.SerializerMethodField()
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    def get_workspace_id(self, obj):
        return str(obj.workspace.id)

    class Meta:
        model = Board
        fields = ["id", "name", "board_type", "workspace_id", "workspace_name"]


class BoardMemberSerializer(serializers.ModelSerializer):
    user = MiniUserSerializer(read_only=True)
    user_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = BoardMember
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
        return BoardMember.objects.create(user=user, **validated_data)


class BoardMemberBulkItemSerializer(serializers.Serializer):
    user_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=BoardMember.Role.choices, default=BoardMember.Role.EDITOR)

    def validate_user_id(self, value):
        from django.contrib.auth import get_user_model

        User = get_user_model()
        try:
            return User.objects.get(pk=value)
        except User.DoesNotExist:
            raise serializers.ValidationError("User not found.")


class BoardMemberBulkSerializer(serializers.Serializer):
    members = BoardMemberBulkItemSerializer(many=True)

    def validate_members(self, value):
        if not value:
            raise serializers.ValidationError("At least one member is required.")
        return value


# ── v2.5.0 — Wiki & Documents ─────────────────────────────────────────────────


class WikiRevisionSerializer(serializers.ModelSerializer):
    author = MiniUserSerializer(read_only=True)

    class Meta:
        model = WikiRevision
        fields = ["id", "title", "content", "author", "created_at"]
        read_only_fields = ["id", "author", "created_at"]


class WikiPageSerializer(serializers.ModelSerializer):
    created_by = MiniUserSerializer(read_only=True)
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = WikiPage
        fields = [
            "id",
            "title",
            "slug",
            "content",
            "is_public",
            "order",
            "parent",
            "created_by",
            "children_count",
            "created_at",
            "updated_at",
        ]
        # slug is always auto-generated from title — never required from the client
        read_only_fields = ["id", "slug", "created_by", "created_at", "updated_at"]

    def get_children_count(self, obj):
        return len(obj.children.all())

    def create(self, validated_data):
        from django.utils.text import slugify
        import uuid as _uuid

        title = validated_data.get("title", "")
        base_slug = slugify(title) or str(_uuid.uuid4())[:8]
        board = validated_data["board"]
        slug = base_slug
        counter = 1
        while WikiPage.objects.filter(board=board, slug=slug).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1
        validated_data["slug"] = slug
        return super().create(validated_data)


class DocumentSerializer(serializers.ModelSerializer):
    created_by = MiniUserSerializer(read_only=True)

    class Meta:
        model = Document
        fields = ["id", "title", "content", "created_by", "created_at", "updated_at"]
        read_only_fields = ["id", "created_by", "created_at", "updated_at"]


# ── v2.6.0 — Forms & Intake ───────────────────────────────────────────────────
class FormFieldSerializer(serializers.ModelSerializer):
    class Meta:
        model = FormField
        fields = [
            "id",
            "label",
            "field_type",
            "placeholder",
            "is_required",
            "options",
            "order",
        ]
        read_only_fields = ["id"]


class FormSerializer(serializers.ModelSerializer):
    fields = FormFieldSerializer(many=True, read_only=True)
    created_by = MiniUserSerializer(read_only=True)
    submission_count = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = [
            "id",
            "name",
            "description",
            "is_active",
            "token",
            "config",
            "fields",
            "created_by",
            "submission_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "token", "created_by", "created_at", "updated_at"]

    def get_submission_count(self, obj):
        return getattr(obj, "_submission_count", obj.submissions.count())


class FormSubmissionSerializer(serializers.ModelSerializer):
    task_title = serializers.SerializerMethodField()

    class Meta:
        model = FormSubmission
        fields = [
            "id",
            "answers",
            "submitter_email",
            "task",
            "task_title",
            "status",
            "submitted_at",
        ]
        read_only_fields = ["id", "task", "submitted_at"]

    def get_task_title(self, obj):
        return obj.task.title if obj.task else None


class PublicFormSerializer(serializers.ModelSerializer):
    """Stripped-down serializer for unauthenticated public form view."""

    fields = FormFieldSerializer(many=True, read_only=True)

    class Meta:
        model = Form
        fields = ["id", "name", "description", "config", "fields"]


# ── v2.7.0 — Automation ───────────────────────────────────────────────────────
class AutomationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AutomationLog
        fields = [
            "id",
            "trigger_payload",
            "actions_run",
            "exec_status",
            "error_message",
            "duration_ms",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class AutomationRuleSerializer(serializers.ModelSerializer):
    logs_preview = serializers.SerializerMethodField()

    class Meta:
        model = AutomationRule
        fields = [
            "id",
            "name",
            "is_active",
            "fire_count",
            "trigger",
            "conditions",
            "actions",
            "logs_preview",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "fire_count", "created_at", "updated_at"]

    def get_logs_preview(self, obj):
        recent = obj.logs.order_by("-created_at")[:5]
        return AutomationLogSerializer(recent, many=True).data


# ── v3.6.0 — Approval Workflows ──────────────────────────────────────────────


class ApprovalReviewerSerializer(serializers.ModelSerializer):
    user = MiniUserSerializer(read_only=True)
    user_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = ApprovalReviewer
        fields = ["id", "user", "user_id", "status", "comment", "reviewed_at"]
        read_only_fields = ["id", "user", "status", "comment", "reviewed_at"]


class ApprovalSerializer(serializers.ModelSerializer):
    requested_by = MiniUserSerializer(read_only=True)
    reviewers = ApprovalReviewerSerializer(many=True, read_only=True)
    reviewer_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=True
    )
    approved_count = serializers.SerializerMethodField()
    total_count = serializers.SerializerMethodField()

    class Meta:
        model = Approval
        fields = [
            "id",
            "status",
            "due_date",
            "note",
            "requested_by",
            "reviewers",
            "reviewer_ids",
            "approved_count",
            "total_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "status", "requested_by", "created_at", "updated_at"]

    def get_approved_count(self, obj):
        reviewers = obj.reviewers.all()
        return sum(1 for r in reviewers if r.status == ApprovalReviewer.Status.APPROVED)

    def get_total_count(self, obj):
        return obj.reviewers.all().count()

    def create(self, validated_data):
        reviewer_ids = validated_data.pop("reviewer_ids")
        approval = Approval.objects.create(**validated_data)
        for uid in reviewer_ids:
            ApprovalReviewer.objects.get_or_create(approval=approval, user_id=uid)
        return approval


class ApprovalReviewSerializer(serializers.Serializer):
    """Validates and applies a reviewer's verdict (approved / rejected / changes_requested)."""

    status = serializers.ChoiceField(choices=[
        ApprovalReviewer.Status.APPROVED,
        ApprovalReviewer.Status.REJECTED,
        ApprovalReviewer.Status.CHANGES_REQUESTED,
    ])
    comment = serializers.CharField(required=False, allow_blank=True, default="")

    def update(self, reviewer, validated_data):
        reviewer.status = validated_data["status"]
        reviewer.comment = validated_data.get("comment", "")
        reviewer.reviewed_at = timezone.now()
        reviewer.save(update_fields=["status", "comment", "reviewed_at"])
        return reviewer


class ApprovalResubmitSerializer(serializers.Serializer):
    """Guards requester identity + approval state, then resets all reviewer verdicts to pending."""

    def validate(self, data):
        approval = self.instance
        if approval.requested_by != self.context["request"].user:
            raise PermissionDenied("Only the original requester can resubmit.")
        if approval.status == Approval.Status.APPROVED:
            raise serializers.ValidationError("This approval is already approved.")
        return data

    def update(self, approval, validated_data):
        approval.status = Approval.Status.PENDING
        approval.save(update_fields=["status", "updated_at"])
        approval.reviewers.all().update(status=ApprovalReviewer.Status.PENDING, comment="")
        return approval


# ── v3.8.0 — OKR & Goal Tracking ─────────────────────────────────────────────


class KeyResultSerializer(serializers.ModelSerializer):
    progress = serializers.SerializerMethodField()
    task_ids = serializers.SerializerMethodField()
    linked_tasks = serializers.SerializerMethodField()

    class Meta:
        model = KeyResult
        fields = [
            "id",
            "title",
            "progress",
            "task_ids",
            "linked_tasks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "progress",
            "task_ids",
            "linked_tasks",
            "created_at",
            "updated_at",
        ]

    def get_progress(self, obj):
        return obj.progress

    def get_task_ids(self, obj):
        return [str(pk) for pk in obj.tasks.values_list("id", flat=True)]

    def get_linked_tasks(self, obj):
        return KeyResultLinkedTaskSerializer(
            obj.tasks.select_related("status").all(), many=True
        ).data

    def create(self, validated_data):
        task_ids = self.initial_data.get("task_ids", [])
        kr = KeyResult.objects.create(**validated_data)
        if task_ids:
            kr.tasks.set(task_ids)
        return kr

    def update(self, instance, validated_data):
        task_ids = self.initial_data.get("task_ids", None)
        instance = super().update(instance, validated_data)
        if task_ids is not None:
            instance.tasks.set(task_ids)
        return instance


class ObjectiveSerializer(serializers.ModelSerializer):
    owner_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    owner = MiniUserSerializer(read_only=True)
    key_results = KeyResultSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    confidence = serializers.SerializerMethodField()

    class Meta:
        model = Objective
        fields = [
            "id",
            "title",
            "description",
            "time_period",
            "start_date",
            "end_date",
            "owner",
            "owner_id",
            "key_results",
            "progress",
            "confidence",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "owner",
            "progress",
            "confidence",
            "created_at",
            "updated_at",
        ]

    def get_progress(self, obj):
        return obj.progress

    def get_confidence(self, obj):
        return obj.confidence

    def create(self, validated_data):
        validated_data.setdefault("owner", self.context["request"].user)
        return super().create(validated_data)


class KeyResultLinkedTaskSerializer(serializers.ModelSerializer):
    """Minimal task info for the 'linked tasks' list on a KR."""

    status_name = serializers.CharField(
        source="status.name", read_only=True, default=""
    )
    is_done = serializers.BooleanField(
        source="status.is_done", read_only=True, default=False
    )

    class Meta:
        model = Task
        fields = ["id", "title", "priority", "status_name", "is_done"]
