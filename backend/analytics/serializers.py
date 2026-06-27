import datetime

from rest_framework import serializers

from accounts.serializers import MiniUserSerializer
from projects.models import Task
from projects.serializers import MiniTaskStatusSerializer


class TeamMemberSerializer(serializers.Serializer):
    """
    One row of the consolidated team-workload view — merges total assigned,
    open, overdue, completed, points, and the per-day due heatmap for a member.

    `user` reuses the canonical MiniUserSerializer (id/email/full_name/avatar…).
    Requires two context dicts keyed by str(user_id):
      - 'rollup'     : {uid: {assigned, open, overdue, completed, points}}
      - 'day_counts' : {uid: {date_str: int}}
    """

    user = MiniUserSerializer(source="*", read_only=True)
    assigned = serializers.SerializerMethodField()
    open = serializers.SerializerMethodField()
    overdue = serializers.SerializerMethodField()
    completed = serializers.SerializerMethodField()
    points = serializers.SerializerMethodField()
    days = serializers.SerializerMethodField()
    total_due = serializers.SerializerMethodField()

    def _roll(self, obj):
        return self.context["rollup"].get(str(obj.id), {})

    def get_assigned(self, obj):
        return self._roll(obj).get("assigned", 0)

    def get_open(self, obj):
        return self._roll(obj).get("open", 0)

    def get_overdue(self, obj):
        return self._roll(obj).get("overdue", 0)

    def get_completed(self, obj):
        return self._roll(obj).get("completed", 0)

    def get_points(self, obj):
        return self._roll(obj).get("points") or 0

    def get_days(self, obj):
        return self.context["day_counts"][str(obj.id)]

    def get_total_due(self, obj):
        return sum(self.context["day_counts"][str(obj.id)].values())


class TaskDrilldownSerializer(serializers.ModelSerializer):
    """
    Lightweight task row for the analytics drill-down — only the fields needed
    to render a clickable row and open the task detail panel.

    `board_id` is mandatory for the frontend deep-link
    (/w/{ws}/boards/{board_id}?task={id}). Reuses MiniUserSerializer and
    MiniTaskStatusSerializer so avatar/status shapes match the rest of the API
    while keeping the row lean (status is id/name/color only — no order/flags).
    Expects instances with select_related("status", "assignee", "board").
    """

    board_id = serializers.SerializerMethodField()
    board = serializers.CharField(source="board.name", read_only=True)
    status = MiniTaskStatusSerializer(read_only=True)
    assignee = MiniUserSerializer(read_only=True)
    days_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "board_id",
            "board",
            "title",
            "priority",
            "task_type",
            "estimate_points",
            "due_date",
            "status",
            "assignee",
            "days_overdue",
        ]
        read_only_fields = fields

    def get_board_id(self, obj):
        return str(obj.board_id)

    def get_days_overdue(self, obj):
        done = obj.status.is_done if obj.status_id else False
        if obj.due_date and not done:
            d = (datetime.date.today() - obj.due_date).days
            return d if d > 0 else 0
        return 0
