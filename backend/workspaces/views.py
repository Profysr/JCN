from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
import datetime
from django.utils import timezone
from rest_framework.parsers import MultiPartParser, FormParser
from .models import (
    Workspace,
    WorkspaceMember,
    WorkspaceInvite,
    Notification,
    OnboardingState,
    InboxItem,
    WorkspaceAPIKey,
    Webhook,
    WebhookDelivery,
    ImportJob,
)
from .serializers import (
    WorkspaceSerializer,
    WorkspaceMemberSerializer,
    WorkspaceInviteSerializer,
    NotificationSerializer,
    InboxItemSerializer,
    WorkspaceAPIKeySerializer,
    APIKeyCreateSerializer,
    WebhookSerializer,
    WebhookCreateSerializer,
    WebhookDeliverySerializer,
    ImportJobSerializer,
    ImportJobDetailSerializer,
)
from .importers.registry import get_parser, SUPPORTED_SOURCES
from .tasks import deliver_webhook, run_import


def _is_workspace_admin(workspace, user):
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role=WorkspaceMember.Role.ADMIN
    ).exists()


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

    def get_object(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def get(self, request, slug):
        workspace = self.get_object(slug, request.user)
        return Response(
            WorkspaceSerializer(workspace, context={"request": request}).data
        )

    def patch(self, request, slug):
        workspace = self.get_object(slug, request.user)
        serializer = WorkspaceSerializer(
            workspace, data=request.data, partial=True, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug):
        workspace = self.get_object(slug, request.user)
        if workspace.owner != request.user:
            return Response(
                {"detail": "Only the owner can delete this workspace."},
                status=status.HTTP_403_FORBIDDEN,
            )
        workspace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# ── Workspace Members View ────────────────────────────────────────────────────────────
class WorkspaceMemberListView(ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceMemberSerializer

    def get_queryset(self):
        workspace = get_object_or_404(
            Workspace, slug=self.kwargs["slug"], members__user=self.request.user
        )
        return workspace.members.select_related("user").all()

class WorkspaceMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, slug, member_id, user):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=user)
        return (
            get_object_or_404(WorkspaceMember, workspace=workspace, id=member_id),
            workspace,
        )

    def patch(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        if not _is_workspace_admin(workspace, request.user):
            return Response(
                {"detail": "Only admins can update member roles."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = WorkspaceMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        if member.user == request.user:
            return Response(
                {"detail": "You cannot remove yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _is_workspace_admin(workspace, request.user):
            return Response(
                {"detail": "Only admins can remove members."},
                status=status.HTTP_403_FORBIDDEN,
            )
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

# ── Invite Members View ────────────────────────────────────────────────────────────
class InviteMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        serializer = WorkspaceInviteSerializer(
            data=request.data, context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

class WorkspaceInviteListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        invites = workspace.invites.filter(
            status=WorkspaceInvite.Status.PENDING
        ).select_related("invited_by")
        return Response(WorkspaceInviteSerializer(invites, many=True).data)

class WorkspaceInviteCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, slug, token):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        if not _is_workspace_admin(workspace, request.user):
            return Response(
                {"detail": "Only admins can cancel invites."},
                status=status.HTTP_403_FORBIDDEN,
            )
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
                    "slug": invite.workspace.slug,
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

        # Users who join via invite cannot create their own workspaces —
        # they are consumers of an existing workspace, not workspace owners.
        if request.user.can_create_workspace:
            request.user.can_create_workspace = False
            request.user.save(update_fields=["can_create_workspace"])
        return Response(
            WorkspaceSerializer(invite.workspace, context={"request": request}).data
        )

# ── Notifications and v3.7.0 — Inbox ─────────────────────────────────────────────────────────────
class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        notifs = Notification.objects.filter(recipient=request.user).select_related(
            "actor"
        )[:50]
        return Response(NotificationSerializer(notifs, many=True).data)

class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        notif_id = request.data.get("id")
        if notif_id:
            Notification.objects.filter(id=notif_id, recipient=request.user).update(
                read=True
            )
        else:
            Notification.objects.filter(recipient=request.user, read=False).update(
                read=True
            )
        return Response({"status": "ok"})

class InboxListView(APIView):
    """
    GET /api/inbox/?workspace=<slug>&tab=<for_you|all|done>&event_type=<type>
    Returns InboxItems for the current user across all (or one) workspace.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # 1. Fetch parameters
        workspace_slug = request.query_params.get("workspace")
        tab = request.query_params.get("tab", "for_you")
        event_type = request.query_params.get("event_type")
        limit = min(int(request.query_params.get("limit", 20)), 50)

        # 2. Build and process queryset
        qs = InboxItem.objects.filter(user=request.user).select_related("workspace")
        qs = self._filter_queryset(qs, tab, workspace_slug, event_type)

        # 3. Serialize and return response
        serializer = InboxItemSerializer(qs[:limit], many=True)
        return Response(serializer.data)

    def _filter_queryset(self, qs, tab, workspace_slug=None, event_type=None):
        """Filters the queryset based on params and updates expired snoozed items."""

        # Apply workspace filter
        if workspace_slug:
            qs = qs.filter(workspace__slug=workspace_slug)

        # Apply event type filter
        if event_type:
            qs = qs.filter(event_type=event_type)

        # Handle "snoozed" expiration logic (Side effect)
        # Note: We update expired items before checking the tab state so 'for_you' or 'all'
        # includes newly un-snoozed items instantly.
        qs.filter(
            status=InboxItem.Status.SNOOZED, snoozed_until__lte=timezone.now()
        ).update(status=InboxItem.Status.UNREAD, snoozed_until=None)

        # Apply tab-specific status filters
        if tab == "for_you":
            qs = qs.filter(status__in=[InboxItem.Status.UNREAD, InboxItem.Status.READ])
        elif tab == "done":
            qs = qs.filter(status=InboxItem.Status.ARCHIVED)
        elif tab == "snoozed":
            qs = qs.filter(status=InboxItem.Status.SNOOZED)
        else:  # "all"
            qs = qs.exclude(status=InboxItem.Status.ARCHIVED)

        return qs

class InboxUnreadCountView(APIView):
    """
    GET /api/inbox/unread-count/?workspace=<slug> — lightweight unread count for badges.
    Avoids fetching the full inbox list just to render the bell/nav badge.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_slug = request.query_params.get("workspace")
        qs = InboxItem.objects.filter(user=request.user, status=InboxItem.Status.UNREAD)
        if workspace_slug:
            qs = qs.filter(workspace__slug=workspace_slug)
        return Response({"count": qs.count()})

class InboxItemUpdateView(APIView):
    """PATCH /api/inbox/<id>/ — update status (read/archived/snoozed) on one item."""

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, item_id):
        from django.shortcuts import get_object_or_404

        item = get_object_or_404(InboxItem, id=item_id, user=request.user)
        serializer = InboxItemSerializer(item, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Also mark the linked Notification as read when inbox item is read/archived
        if item.status in [InboxItem.Status.READ, InboxItem.Status.ARCHIVED]:
            if item.notification_id:
                Notification.objects.filter(id=item.notification_id).update(read=True)
        return Response(serializer.data)

class InboxBulkUpdateView(APIView):
    """POST /api/inbox/bulk/ — update status on multiple items at once."""

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

        qs = InboxItem.objects.filter(user=request.user, id__in=ids)

        if action == "read":
            qs.update(status=InboxItem.Status.READ)
            Notification.objects.filter(inbox_item__in=qs, read=False).update(read=True)
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

# ── v2.3.0 — Onboarding ───────────────────────────────────────────────────────
class OnboardingStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def _checklist(self, workspace):
        from projects.models import Project, Task

        has_project = Project.objects.filter(workspace=workspace).exists()
        has_task = Task.objects.filter(project__workspace=workspace).exists()
        has_member = WorkspaceMember.objects.filter(workspace=workspace).count() > 1
        return {
            "create_project": has_project,
            "add_task": has_task,
            "invite_teammate": has_member,
            "integration": False, 
            "setup_automation": False, 
        }

    def _user_dismissed(self, state, user_id):
        """Per-user dismissal stored in a JSON list of user UUID strings."""
        return str(user_id) in (state.dismissed_by_users or [])

    def _build_response(self, state, workspace, request):
        user_id = str(request.user.id)
        return {
            "wizard_completed": state.wizard_completed,
            "team_type": state.team_type,
            "checklist_dismissed": self._user_dismissed(state, user_id),
            "checklist": self._checklist(workspace),
            # Only the workspace creator sees the onboarding experience.
            "user_is_admin": workspace.owner == request.user,
        }

    def get(self, request, slug):
        workspace = self._get_workspace(slug, request.user)
        state, _ = OnboardingState.objects.get_or_create(workspace=workspace)
        return Response(self._build_response(state, workspace, request))

    def patch(self, request, slug):
        workspace = self._get_workspace(slug, request.user)
        state, _ = OnboardingState.objects.get_or_create(workspace=workspace)

        for field in ("wizard_completed", "team_type"):
            if field in request.data:
                setattr(state, field, request.data[field])

        # Per-user dismiss: add current user's ID to the dismissed list
        if request.data.get("checklist_dismissed") is True:
            dismissed = list(state.dismissed_by_users or [])
            uid = str(request.user.id)
            if uid not in dismissed:
                dismissed.append(uid)
            state.dismissed_by_users = dismissed

        state.save()
        return Response(self._build_response(state, workspace, request))


# ── v4.5.0 — Public API Keys ──────────────────────────────────────────────────
def _require_admin(workspace, user):
    """Raise PermissionDenied if user is not an admin/owner of the workspace."""
    from rest_framework.exceptions import PermissionDenied

    member = workspace.members.filter(user=user).first()
    if not member or member.role not in ("admin",):
        if workspace.owner != user:
            raise PermissionDenied("Only workspace admins can manage API keys.")

class APIKeyListCreateView(APIView):
    """
    GET  /api/workspaces/:slug/api-keys/  — list active api keys (prefix + meta only, never the hash)
    POST /api/workspaces/:slug/api-keys/  — generate a new key; raw key is returned exactly once
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        keys = ws.api_keys.filter(is_active=True)
        return Response(WorkspaceAPIKeySerializer(keys, many=True).data)

    def post(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        s = APIKeyCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        key_obj, raw = WorkspaceAPIKey.generate(
            workspace=ws, created_by=request.user, **s.validated_data
        )
        serialize_data = WorkspaceAPIKeySerializer(key_obj).data
        serialize_data["key"] = raw # Attach the raw key to this response only — it cannot be retrieved again
        return Response(serialize_data, status=status.HTTP_201_CREATED)

class APIKeyDetailView(APIView):
    """DELETE /api/workspaces/:slug/api-keys/:key_id/ — revoke a key."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, key_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        key = get_object_or_404(WorkspaceAPIKey, id=key_id, workspace=ws)
        
        key.is_active = False
        key.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v4.5.0 — Webhooks ─────────────────────────────────────────────────────────
class WebhookListCreateView(APIView):
    """
    GET  /api/workspaces/:slug/webhooks/ — list all webhooks for this workspace
    POST /api/workspaces/:slug/webhooks/ — register a new webhook; signing secret returned once
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        return Response(WebhookSerializer(ws.webhooks.all(), many=True).data)

    def post(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        s = WebhookCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        hook = Webhook.create_with_secret(workspace=ws, **s.validated_data)
        data = WebhookSerializer(hook).data
        data["secret"] = hook.secret
        return Response(data, status=status.HTTP_201_CREATED)


class WebhookDetailView(APIView):
    """
    PATCH  /api/workspaces/:slug/webhooks/:hook_id/ — update name, URL, events, or is_active
    DELETE /api/workspaces/:slug/webhooks/:hook_id/ — permanently remove the webhook
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_slug, hook_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        s = WebhookSerializer(hook, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        updated = s.save()
        return Response(WebhookSerializer(updated).data)

    def delete(self, request, workspace_slug, hook_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        # Hard-delete: removes the row and cascades to all WebhookDelivery log entries
        get_object_or_404(Webhook, id=hook_id, workspace=ws).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookTestView(APIView):
    """POST /api/workspaces/:slug/webhooks/:hook_id/test/ — fire a ping event to verify the URL is reachable."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, hook_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)

        # Queued via Celery — the actual HTTP call happens in the background worker
        deliver_webhook.delay(
            str(hook.id),
            "ping",
            {
                "event": "ping",
                "hook_id": str(hook.id),
                "workspace": ws.slug,
            },
        )
        return Response({"ok": True, "message": "Test event queued"})


class WebhookDeliveryListView(APIView):
    """GET /api/workspaces/:slug/webhooks/:hook_id/deliveries/ — recent delivery log (latest 50)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, hook_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        # Capped at 50 — WebhookDelivery.Meta ordering is -created_at so newest come first
        deliveries = hook.deliveries.all()[:50]
        return Response(WebhookDeliverySerializer(deliveries, many=True).data)


# ── v4.6.0 — Import & Migration Tools ────────────────────────────────────────
class ImportSourcesView(APIView):
    """GET /api/workspaces/:slug/import/sources/ — list available source formats."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):

        return Response(
            [
                {"id": k, "label": v["label"], "format": v["format"]}
                for k, v in SUPPORTED_SOURCES.items()
            ]
        )


class ImportJobListCreateView(APIView):
    """
    GET  — list the 8 most recent import jobs for this workspace
    POST — upload a file + source, parse it, return preview + field mapping
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        jobs = ImportJob.objects.filter(workspace=ws).order_by("-created_at")[:8]
        return Response(ImportJobSerializer(jobs, many=True).data)

    def post(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
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
            else:  # csv
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
        return Response(
            {
                **detail,
                "headers": headers,
            },
            status=201,
        )


class ImportJobDetailView(APIView):
    """
    GET   — current job status, progress, preview, and field mapping
    PATCH — update field_mapping before running the import
    """

    permission_classes = [permissions.IsAuthenticated]

    def _get_job(self, workspace_slug, job_id, user):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        return get_object_or_404(ImportJob, id=job_id, workspace=ws)

    def get(self, request, workspace_slug, job_id):
        job = self._get_job(workspace_slug, job_id, request.user)
        return Response(ImportJobDetailSerializer(job).data)

    def patch(self, request, workspace_slug, job_id):
        job = self._get_job(workspace_slug, job_id, request.user)
        mapping = request.data.get("field_mapping")
        if mapping is not None:
            job.field_mapping = mapping
            job.save(update_fields=["field_mapping"])
        return Response({"ok": True})

    def delete(self, request, workspace_slug, job_id):
        job = self._get_job(workspace_slug, job_id, request.user)
        if job.status == ImportJob.Status.IMPORTING:
            return Response(
                {"error": "Cannot delete a job that is currently importing."},
                status=400,
            )
        job.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImportJobRunView(APIView):
    """POST — kick off the Celery import task for an existing job."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, job_id):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        job = get_object_or_404(ImportJob, id=job_id, workspace=ws)

        if job.status not in (ImportJob.Status.MAPPED, ImportJob.Status.FAILED):
            return Response(
                {"error": f"Job is in state '{job.status}', cannot run."},
                status=400,
            )

        run_import.delay(str(job.id))
        return Response({"ok": True, "job_id": str(job.id)})


class ImportJobRollbackView(APIView):
    """DELETE — undo an import by deleting all tasks it created (within 24 h)."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, job_id):
        from projects.models import Task

        ws = get_object_or_404(Workspace, slug=workspace_slug)
        job = get_object_or_404(ImportJob, id=job_id, workspace=ws)

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
