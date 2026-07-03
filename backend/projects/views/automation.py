# ‼️ AUTOMATION VIEWS — DISABLED (routes commented out in urls.py)
# ‼️ Re-enable by uncommenting the three paths in urls.py and the import in __init__.py.

from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from ..models import Board, AutomationRule, AutomationLog
from ..serializers import AutomationRuleSerializer, AutomationLogSerializer
from .helpers import (
    get_workspace_for_user,
    _require_board_perm,
)


# ‼️ ── v2.7.0 — Automation Engine (disabled) ──────────────────────────────────


class AutomationRuleListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        rules = board.automation_rules.all()
        return Response(AutomationRuleSerializer(rules, many=True).data)

    def post(self, request, workspace_id, board_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        _require_board_perm(request.user, board, "edit")
        serializer = AutomationRuleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rule = serializer.save(board=board, created_by=request.user)
        return Response(
            AutomationRuleSerializer(rule).data, status=status.HTTP_201_CREATED
        )


class AutomationRuleDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_rule(self, workspace_id, board_id, rule_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        return get_object_or_404(AutomationRule, id=rule_id, board=board), board

    def patch(self, request, workspace_id, board_id, rule_id):
        rule, board = self._get_rule(workspace_id, board_id, rule_id, request.user)
        _require_board_perm(request.user, board, "edit")
        serializer = AutomationRuleSerializer(rule, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, board_id, rule_id):
        rule, board = self._get_rule(workspace_id, board_id, rule_id, request.user)
        _require_board_perm(request.user, board, "admin")
        rule.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AutomationLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, board_id, rule_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=board_id, workspace=workspace)
        rule = get_object_or_404(AutomationRule, id=rule_id, board=board)
        logs = rule.logs.order_by("-created_at")[:50]
        return Response(AutomationLogSerializer(logs, many=True).data)
