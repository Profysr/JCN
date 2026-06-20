import datetime
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.generics import ListAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.fields import parse_id, format_id
from .importers.registry import SUPPORTED_SOURCES, get_parser
from .models import (
    ImportJob,
    InboxItem,
    OnboardingState,
    Webhook,
    WebhookDelivery,
    Workspace,
    WorkspaceAPIKey,
    WorkspaceInvite,
    WorkspaceMember,
)
from .serializers import (
    APIKeyCreateSerializer,
    ImportJobDetailSerializer,
    ImportJobSerializer,
    InboxItemSerializer,
    WebhookCreateSerializer,
    WebhookDeliverySerializer,
    WebhookSerializer,
    WorkspaceAPIKeySerializer,
    WorkspaceInviteSerializer,
    WorkspaceMemberSerializer,
    WorkspaceSerializer,
)
from .tasks import deliver_webhook, run_import


# ── SHARED PRODUCTION UTILITIES ──────────────────────────────────────────────────
def _parse_pk(value):
    """Accepts a prefixed ID (e.g. 'tsk_018e...') or a plain UUID string."""
    try:
        return parse_id(value)
    except (ValueError, AttributeError, TypeError):
        return value


def _get_workspace(workspace_id, user):
    """
    Safely retrieves a workspace ensuring the requesting user is a member.
    Prevents side-channel leaks by raising a 404 if the workspace doesn't exist
    OR if the user has no access to it.
    """
    return get_object_or_404(Workspace, id=_parse_pk(workspace_id), members__user=user)


def _is_workspace_admin(workspace, user) -> bool:
    """Returns True if the user is an explicit Admin member of the workspace."""
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role=WorkspaceMember.Role.ADMIN
    ).exists()


def _require_admin(workspace, user):
    """Fails early and throws an explicit DRF PermissionDenied exception if the user lacks access."""
    # Check if they are the platform-level workspace owner or an authorized Admin member
    if workspace.owner == user:
        return

    member = workspace.members.filter(user=user).first()
    if not member or member.role not in ("admin", WorkspaceMember.Role.ADMIN):
        raise PermissionDenied("Only workspace admins can perform this action.")


# ==============================================================================
# ── CORE WORKSPACE MANAGEMENT ──────────────────────────────────────────────────
# ==============================================================================


class WorkspaceListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspaces = Workspace.objects.filter(members__user=request.user).distinct()
        serializer = WorkspaceSerializer(
            workspaces, many=True, context={"request": request}
        )
        return Response(serializer.data)

    def post(self, request):
        serializer = WorkspaceSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        return Response(
            WorkspaceSerializer(workspace, context={"request": request}).data
        )

    def patch(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        serializer = WorkspaceSerializer(
            workspace, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        if workspace.owner != request.user:
            return Response(
                {"detail": "Only the owner can delete this workspace."},
                status=status.HTTP_403_FORBIDDEN,
            )
        workspace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# ── WORKSPACE MEMBERSHIP & INVITES ────────────────────────────────────────────
# ==============================================================================


class WorkspaceMemberListView(ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceMemberSerializer

    def get_queryset(self):
        workspace = _get_workspace(self.kwargs["workspace_id"], self.request.user)
        return workspace.members.select_related("user").all()


class WorkspaceMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_member_and_workspace(self, workspace_id, member_id, user):
        workspace = _get_workspace(workspace_id, user)
        member = get_object_or_404(
            WorkspaceMember, workspace=workspace, id=_parse_pk(member_id)
        )
        return member, workspace

    def patch(self, request, workspace_id, member_id):
        member, workspace = self._get_member_and_workspace(
            workspace_id, member_id, request.user
        )
        _require_admin(workspace, request.user)

        serializer = WorkspaceMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, workspace_id, member_id):
        member, workspace = self._get_member_and_workspace(
            workspace_id, member_id, request.user
        )

        if member.user == request.user:
            return Response(
                {"detail": "You cannot remove yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        _require_admin(workspace, request.user)

        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id):
        from .tasks import send_invite_email
        workspace = _get_workspace(workspace_id, request.user)
        serializer = WorkspaceInviteSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        invite = serializer.save()
        send_invite_email.delay(str(invite.id))
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceInviteListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        invites = workspace.invites.filter(
            status=WorkspaceInvite.Status.PENDING
        ).select_related("invited_by")
        return Response(WorkspaceInviteSerializer(invites, many=True).data)


class WorkspaceInviteCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, token):
        workspace = _get_workspace(workspace_id, request.user)
        _require_admin(workspace, request.user)

        invite = get_object_or_404(WorkspaceInvite, token=token, workspace=workspace)
        invite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteDetailView(APIView):
    """Public endpoint — returns invite info so the accept page can display it before login."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(
            WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING
        )
        return Response(
            {
                "token": str(invite.token),
                "email": invite.email,
                "role": invite.role,
                "workspace": {
                    "name": invite.workspace.name,
                    "id": format_id(invite.workspace.PREFIX, invite.workspace.id),
                },
                "invited_by": invite.invited_by.full_name or invite.invited_by.email,
            }
        )


class AcceptInviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        invite = get_object_or_404(
            WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING
        )
        if invite.email != request.user.email:
            return Response(
                {"detail": "This invite is for a different email address."},
                status=status.HTTP_403_FORBIDDEN,
            )

        WorkspaceMember.objects.get_or_create(
            workspace=invite.workspace,
            user=request.user,
            defaults={"role": invite.role, "invited_by": invite.invited_by},
        )
        invite.status = WorkspaceInvite.Status.ACCEPTED
        invite.save()

        if request.user.can_create_workspace:
            request.user.can_create_workspace = False
            request.user.save(update_fields=["can_create_workspace"])

        return Response(
            WorkspaceSerializer(invite.workspace, context={"request": request}).data
        )


# ==============================================================================
# ── NOTIFICATIONS & INBOX ──────────────────────────────────────────────────────
# ==============================================================================


class InboxListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_id = request.query_params.get("workspace")
        tab = request.query_params.get("tab", "for_you")
        event_type = request.query_params.get("event_type")
        limit = min(int(request.query_params.get("limit", 20)), 50)

        qs = InboxItem.objects.filter(user=request.user).select_related("workspace")
        qs = self._filter_queryset(qs, tab, workspace_id, event_type)

        return Response(InboxItemSerializer(qs[:limit], many=True).data)

    def _filter_queryset(self, qs, tab, workspace_id=None, event_type=None):
        if workspace_id:
            qs = qs.filter(workspace__id=_parse_pk(workspace_id))
        if event_type:
            qs = qs.filter(event_type=event_type)

        qs.filter(
            status=InboxItem.Status.SNOOZED, snoozed_until__lte=timezone.now()
        ).update(status=InboxItem.Status.UNREAD, snoozed_until=None)

        if tab == "for_you":
            qs = qs.filter(status__in=[InboxItem.Status.UNREAD, InboxItem.Status.READ])
        elif tab == "done":
            qs = qs.filter(status=InboxItem.Status.ARCHIVED)
        elif tab == "snoozed":
            qs = qs.filter(status=InboxItem.Status.SNOOZED)
        else:
            qs = qs.exclude(status=InboxItem.Status.ARCHIVED)

        return qs


class InboxUnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_id = request.query_params.get("workspace")
        qs = InboxItem.objects.filter(user=request.user, status=InboxItem.Status.UNREAD)
        if workspace_id:
            qs = qs.filter(workspace__id=_parse_pk(workspace_id))
        return Response({"count": qs.count()})


class InboxItemUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, item_id):
        item = get_object_or_404(InboxItem, id=_parse_pk(item_id), user=request.user)
        serializer = InboxItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class InboxBulkUpdateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        ids = request.data.get("ids", [])
        action = request.data.get("action")
        snooze_until = request.data.get("snoozed_until")

        if action not in ["read", "archive", "snooze"]:
            return Response(
                {"detail": "action must be read, archive, or snooze."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = InboxItem.objects.filter(
            user=request.user, id__in=[_parse_pk(i) for i in ids]
        )

        if action == "read":
            qs.update(status=InboxItem.Status.READ)
        elif action == "archive":
            qs.update(status=InboxItem.Status.ARCHIVED)
        elif action == "snooze":
            if not snooze_until:
                return Response(
                    {"detail": "snoozed_until required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            qs.update(status=InboxItem.Status.SNOOZED, snoozed_until=snooze_until)

        return Response({"updated": qs.count()})


# ==============================================================================
# ── ONBOARDING FLOW ────────────────────────────────────────────────────────────
# ==============================================================================


class OnboardingStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _checklist(self, workspace):
        from projects.models import Board, Task

        return {
            "create_board": Board.objects.filter(workspace=workspace).exists(),
            "add_task": Task.objects.filter(board__workspace=workspace).exists(),
            "invite_teammate": WorkspaceMember.objects.filter(
                workspace=workspace
            ).count()
            > 1,
            "integration": False,
            "setup_automation": False,
        }

    def _build_response(self, state, workspace, request):
        user_id = str(request.user.id)
        checklist_dismissed = user_id in (state.dismissed_by_users or [])
        return {
            "wizard_completed": state.wizard_completed,
            "team_type": state.team_type,
            "checklist_dismissed": checklist_dismissed,
            "checklist": self._checklist(workspace),
            "user_is_admin": workspace.owner == request.user,
        }

    def get(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        state, _ = OnboardingState.objects.get_or_create(workspace=workspace)
        return Response(self._build_response(state, workspace, request))

    def patch(self, request, workspace_id):
        workspace = _get_workspace(workspace_id, request.user)
        state, _ = OnboardingState.objects.get_or_create(workspace=workspace)

        for field in ("wizard_completed", "team_type"):
            if field in request.data:
                setattr(state, field, request.data[field])

        if request.data.get("checklist_dismissed") is True:
            dismissed = list(state.dismissed_by_users or [])
            uid = str(request.user.id)
            if uid not in dismissed:
                dismissed.append(uid)
            state.dismissed_by_users = dismissed

        state.save()
        return Response(self._build_response(state, workspace, request))


# ==============================================================================
# ── PUBLIC API KEYS ────────────────────────────────────────────────────────────
# ==============================================================================


class APIKeyListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)
        keys = ws.api_keys.filter(is_active=True)
        return Response(WorkspaceAPIKeySerializer(keys, many=True).data)

    def post(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        s = APIKeyCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        key_obj, raw = WorkspaceAPIKey.generate(
            workspace=ws, created_by=request.user, **s.validated_data
        )

        serialize_data = WorkspaceAPIKeySerializer(key_obj).data
        serialize_data["key"] = raw
        return Response(serialize_data, status=status.HTTP_201_CREATED)


class APIKeyDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, key_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        key = get_object_or_404(WorkspaceAPIKey, id=_parse_pk(key_id), workspace=ws)
        key.is_active = False
        key.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ==============================================================================
# ── WEBHOOKS ──────────────────────────────────────────────────────────────────
# ==============================================================================


class WebhookListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)
        return Response(WebhookSerializer(ws.webhooks.all(), many=True).data)

    def post(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        s = WebhookCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        hook = Webhook.create_with_secret(workspace=ws, **s.validated_data)

        data = WebhookSerializer(hook).data
        data["secret"] = hook.secret
        return Response(data, status=status.HTTP_201_CREATED)


class WebhookDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_id, hook_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        hook = get_object_or_404(Webhook, id=_parse_pk(hook_id), workspace=ws)
        s = WebhookSerializer(hook, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        updated = s.save()
        return Response(WebhookSerializer(updated).data)

    def delete(self, request, workspace_id, hook_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        get_object_or_404(Webhook, id=_parse_pk(hook_id), workspace=ws).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookTestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, hook_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=_parse_pk(hook_id), workspace=ws)

        deliver_webhook.delay(
            str(hook.id),
            "ping",
            {
                "event": "ping",
                "hook_id": str(hook.id),
                "workspace": format_id(ws.PREFIX, ws.id),
            },
        )
        return Response({"ok": True, "message": "Test event queued"})


class WebhookDeliveryListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, hook_id):
        ws = _get_workspace(workspace_id, request.user)
        _require_admin(ws, request.user)

        hook = get_object_or_404(Webhook, id=_parse_pk(hook_id), workspace=ws)
        deliveries = hook.deliveries.all()[:50]
        return Response(WebhookDeliverySerializer(deliveries, many=True).data)


# ==============================================================================
# ── DATA IMPORT & MIGRATION TOOLS ─────────────────────────────────────────────
# ==============================================================================


class ImportSourcesView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id):
        return Response(
            [
                {"id": k, "label": v["label"], "format": v["format"]}
                for k, v in SUPPORTED_SOURCES.items()
            ]
        )


class ImportJobListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        jobs = ImportJob.objects.filter(workspace=ws).order_by("-id")[:8]
        return Response(ImportJobSerializer(jobs, many=True).data)

    def post(self, request, workspace_id):
        ws = _get_workspace(workspace_id, request.user)
        source = request.data.get("source", "").strip()
        file_obj = request.FILES.get("file")

        if not source:
            return Response({"error": "source required"}, status=400)
        if not file_obj:
            return Response({"error": "file required"}, status=400)
        if file_obj.size > 50 * 1024 * 1024:
            return Response({"error": "File exceeds 50 MB limit"}, status=400)
        if source not in SUPPORTED_SOURCES:
            return Response({"error": f"Unknown source: {source}"}, status=400)

        parser = get_parser(source)
        content = file_obj.read().decode("utf-8", errors="replace")

        job = ImportJob.objects.create(
            workspace=ws,
            source=source,
            status=ImportJob.Status.PARSING,
            file_name=file_obj.name,
            created_by=request.user,
        )

        try:
            fmt = SUPPORTED_SOURCES[source]["format"]
            if fmt in ("xml", "json"):
                tasks = parser.parse(content)
                mapping = parser.detect_mapping(content)
                parsed_rows = [t.to_dict() for t in tasks]
                headers = list(mapping.keys())
            else:
                tasks, headers, mapping = parser.parse(content, field_mapping=None)
                flat_mapping = {col: info["jcn_field"] for col, info in mapping.items()}
                tasks, _, _ = parser.parse(content, field_mapping=flat_mapping)
                parsed_rows = [t.to_dict() for t in tasks]

            job.parsed_rows = parsed_rows
            job.preview_rows = parsed_rows[:10]
            job.field_mapping = mapping
            job.status = ImportJob.Status.MAPPED
            job.total_count = len(parsed_rows)
            job.save()

        except Exception as exc:
            job.status = ImportJob.Status.FAILED
            job.error_log = [{"error": str(exc)}]
            job.save(update_fields=["status", "error_log"])
            return Response({"error": str(exc)}, status=400)

        detail = ImportJobDetailSerializer(job).data
        return Response({**detail, "headers": headers}, status=201)


class ImportJobDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_job(self, workspace_id, job_id, user):
        ws = _get_workspace(workspace_id, user)
        return get_object_or_404(ImportJob, id=_parse_pk(job_id), workspace=ws)

    def get(self, request, workspace_id, job_id):
        job = self._get_job(workspace_id, job_id, request.user)
        return Response(ImportJobDetailSerializer(job).data)

    def patch(self, request, workspace_id, job_id):
        job = self._get_job(workspace_id, job_id, request.user)
        mapping = request.data.get("field_mapping")
        if mapping is not None:
            job.field_mapping = mapping
            job.save(update_fields=["field_mapping"])
        return Response({"ok": True})

    def delete(self, request, workspace_id, job_id):
        job = self._get_job(workspace_id, job_id, request.user)
        if job.status == ImportJob.Status.IMPORTING:
            return Response(
                {"error": "Cannot delete a job that is currently importing."},
                status=400,
            )
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImportJobRunView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_id, job_id):
        ws = _get_workspace(workspace_id, request.user)
        job = get_object_or_404(ImportJob, id=_parse_pk(job_id), workspace=ws)

        if job.status not in (ImportJob.Status.MAPPED, ImportJob.Status.FAILED):
            return Response(
                {"error": f"Job is in state '{job.status}', cannot run."}, status=400
            )

        run_import.delay(str(job.id))
        return Response({"ok": True, "job_id": str(job.id)})


class ImportJobRollbackView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_id, job_id):
        from projects.models import Task

        ws = _get_workspace(workspace_id, request.user)
        job = get_object_or_404(ImportJob, id=_parse_pk(job_id), workspace=ws)

        serializer = ImportJobSerializer(job)
        if not serializer.data["can_rollback"]:
            return Response(
                {"error": "Rollback window (24 h) has expired or job is not complete."},
                status=400,
            )

        deleted = Task.objects.filter(id__in=(job.imported_task_ids or [])).delete()[0]
        job.status = ImportJob.Status.FAILED
        job.imported_task_ids = []
        job.save(update_fields=["status", "imported_task_ids"])
        return Response({"deleted": deleted})
