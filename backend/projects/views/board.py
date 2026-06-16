from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Count, Q, Prefetch
from django.utils import timezone
import datetime
from ..models import Board, Sprint, UserPresence, Task
from ..serializers import (
    BoardSerializer,
    BoardMiniSerializer,
    PortfolioBoardSerializer,
    BoardMemberSerializer,
    UserPresenceSerializer,
    MyWorkTaskSerializer,
)
from ..permissions import has_project_permission, log_audit
from workspaces.models import WorkspaceMember
from .helpers import (
    _parse_pk,
    get_workspace_for_user,
    _is_workspace_admin,
    _require_board_admin,
    _require_board_perm,
    broadcast,
)


# ── Boards ✅─────────────────────────────────────────────────────────────────
class BoardListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        boards = Board.objects.for_user(workspace, request.user).filter(
            status=Board.Status.ACTIVE
        )
        return Response(BoardMiniSerializer(boards, many=True).data)

    def post(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        serializer = BoardSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        created = serializer.save()
        board = Board.objects.for_user(workspace, request.user).get(id=created.id)
        return Response(
            BoardSerializer(board, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class BoardDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_board(self, workspace_id, project_id, user):
        workspace = get_workspace_for_user(workspace_id, user)
        return get_object_or_404(
            Board.objects.for_user(workspace, user), id=_parse_pk(project_id)
        )

    def get(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        return Response(BoardSerializer(board, context={"request": request}).data)

    def patch(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        serializer = BoardSerializer(
            board,
            data=request.data,
            partial=True,
            context={"request": request, "workspace": board.workspace},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, project_id):
        board = self.get_board(workspace_id, project_id, request.user)
        if not _is_workspace_admin(board.workspace, request.user):
            return Response(
                {"detail": "Only workspace admins can archive boards."},
                status=status.HTTP_403_FORBIDDEN,
            )
        board.status = Board.Status.ARCHIVED
        board.save(update_fields=["status"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v3.4.0 — Portfolio ✅──────────────────────────────────────────────────────
class PortfolioView(APIView):
    """GET /portfolio/ — cross-project health stats for a workspace."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        today = timezone.now().date()
        boards = (
            Board.objects.for_user(workspace, request.user)
            .filter(status=Board.Status.ACTIVE)
            .annotate(
                overdue_tasks=Count(
                    "tasks",
                    filter=Q(tasks__due_date__lt=today, tasks__status__is_done=False),
                    distinct=True,
                ),
            )
            .prefetch_related(
                Prefetch(
                    "sprints",
                    queryset=Sprint.objects.filter(status="active"),
                    to_attr="active_sprints",
                )
            )
        )
        return Response(PortfolioBoardSerializer(boards, many=True).data)


# ── v2.1.0 — Project Members & Permissions ────────────────────────────────────
class BoardMemberListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, project_id):
        workspace = get_workspace_for_user(workspace_id, request.user)
        board = get_object_or_404(Board, id=_parse_pk(project_id), workspace=workspace)
        if not has_project_permission(request.user, board, "view"):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        members = board.board_members.select_related("user")
        return Response(BoardMemberSerializer(members, many=True).data)

    def post(self, request, workspace_id, project_id):
        workspace, board = _require_board_admin(request, workspace_id, project_id)
        serializer = BoardMemberSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        member = serializer.save(board=board, added_by=request.user)
        # Store an Entry into DB for audits and tracking
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.added",
            resource_type="project_member",
            resource_id=member.id,
            after={"user": str(member.user_id), "role": member.role},
        )
        return Response(
            BoardMemberSerializer(member).data, status=status.HTTP_201_CREATED
        )


class BoardMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_member(self, workspace_id, project_id, member_id, request):
        workspace, board = _require_board_admin(request, workspace_id, project_id)
        from ..models import BoardMember

        member = get_object_or_404(BoardMember, id=member_id, board=board)
        return workspace, board, member

    def patch(self, request, workspace_id, project_id, member_id):
        workspace, board, member = self._get_member(
            workspace_id, project_id, member_id, request
        )
        before_role = member.role
        serializer = BoardMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.role_changed",
            resource_type="project_member",
            resource_id=member.id,
            before={"role": before_role},
            after={"role": member.role},
        )
        return Response(BoardMemberSerializer(member).data)

    def delete(self, request, workspace_id, project_id, member_id):
        workspace, _board, member = self._get_member(
            workspace_id, project_id, member_id, request
        )
        log_audit(
            actor=request.user,
            workspace=workspace,
            action="project_member.removed",
            resource_type="project_member",
            resource_id=member.id,
            before={"user": str(member.user_id), "role": member.role},
        )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v3.4.0 — My Work ─────────────────────────────────────────────────────────
class MyWorkView(APIView):
    """GET /my-work/ — all tasks assigned to the current user, across all workspaces, sorted by urgency."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_ids = WorkspaceMember.objects.filter(user=request.user).values_list(
            "workspace_id", flat=True
        )

        tasks = (
            Task.objects.filter(
                board__workspace_id__in=workspace_ids, assignee=request.user
            )
            .exclude(status__is_done=True)
            .select_related("status", "assignee", "sprint", "board__workspace")
            .prefetch_related("labels", "blocked_by_deps")
        )

        today = timezone.now().date()
        week_end = today + datetime.timedelta(days=7)

        def urgency(t):
            score = 0
            if t.due_date:
                d = t.due_date
                if d < today:
                    score += 100
                elif d == today:
                    score += 30
                elif d <= week_end:
                    score += 10
            if t.priority == "urgent":
                score += 50
            elif t.priority == "high":
                score += 20
            return score

        sorted_tasks = sorted(tasks, key=lambda t: -urgency(t))
        return Response(
            MyWorkTaskSerializer(
                sorted_tasks, many=True, context={"request": request}
            ).data
        )


# ── v3.5.0 — Real-Time Collaboration v2 ──────────────────────────────────────
class UserPresenceView(APIView):
    """
    POST   /workspaces/:slug/presence/  — join/heartbeat a resource
    DELETE /workspaces/:slug/presence/  — leave
    GET    /workspaces/:slug/presence/?resource_type=X&resource_id=Y — active viewers
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_workspace_for_user(slug, user)

    def get(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.query_params.get("resource_type")
        resource_id = request.query_params.get("resource_id")
        cutoff = timezone.now() - datetime.timedelta(seconds=90)
        qs = workspace.presences.filter(last_seen__gte=cutoff).select_related("user")
        if resource_type:
            qs = qs.filter(resource_type=resource_type)
        if resource_id:
            qs = qs.filter(resource_id=resource_id)
        return Response(UserPresenceSerializer(qs, many=True).data)

    def post(self, request, workspace_id):
        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.data.get(
            "resource_type", UserPresence.ResourceType.BOARD
        )
        resource_id = str(request.data.get("resource_id", ""))
        if not resource_id:
            return Response(
                {"detail": "resource_id required."}, status=status.HTTP_400_BAD_REQUEST
            )

        # last_seen is auto_now, so update_or_create already stamps it on save.
        presence, _ = UserPresence.objects.update_or_create(
            user=request.user,
            workspace=workspace,
            resource_type=resource_type,
            resource_id=resource_id,
            defaults={},
        )

        data = UserPresenceSerializer(presence).data
        broadcast(
            workspace_id,
            "presence.updated",
            {
                "resource_type": resource_type,
                "resource_id": resource_id,
                "user": data["user"],
                "last_seen": data["last_seen"],
                "action": "join",
            },
        )
        return Response(data)

    def delete(self, request, workspace_id):
        from accounts.serializers import MiniUserSerializer

        workspace = self._get_workspace(workspace_id, request.user)
        resource_type = request.data.get("resource_type")
        resource_id = str(request.data.get("resource_id", ""))

        qs = UserPresence.objects.filter(user=request.user, workspace=workspace)
        if resource_type and resource_id:
            qs = qs.filter(resource_type=resource_type, resource_id=resource_id)
            qs.delete()
            broadcast(
                workspace_id,
                "presence.updated",
                {
                    "resource_type": resource_type,
                    "resource_id": resource_id,
                    "user": MiniUserSerializer(request.user).data,
                    "action": "leave",
                },
            )
        else:
            qs.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
