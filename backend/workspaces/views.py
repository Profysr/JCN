from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.generics import ListAPIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
import datetime
from django.utils import timezone
from .models import Workspace, WorkspaceMember, WorkspaceInvite, Notification, OnboardingState, InboxItem, NotificationPreference, WorkspaceAPIKey, Webhook, WebhookDelivery
from .serializers import (
    WorkspaceSerializer, WorkspaceMemberSerializer, WorkspaceInviteSerializer,
    NotificationSerializer, InboxItemSerializer, NotificationPreferenceSerializer,
)


class WorkspaceListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspaces = Workspace.objects.filter(members__user=request.user).distinct()
        serializer = WorkspaceSerializer(workspaces, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request):
        if not request.user.can_create_workspace:
            return Response(
                {"detail": "Your account cannot create workspaces. "
                           "Contact the workspace admin to get an invite."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = WorkspaceSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def get(self, request, slug):
        workspace = self.get_object(slug, request.user)
        return Response(WorkspaceSerializer(workspace, context={"request": request}).data)

    def patch(self, request, slug):
        workspace = self.get_object(slug, request.user)
        serializer = WorkspaceSerializer(workspace, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug):
        workspace = self.get_object(slug, request.user)
        if workspace.owner != request.user:
            return Response({"detail": "Only the owner can delete this workspace."}, status=status.HTTP_403_FORBIDDEN)
        workspace.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

class WorkspaceMemberListView(ListAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = WorkspaceMemberSerializer

    def get_queryset(self):
        workspace = get_object_or_404(Workspace, slug=self.kwargs["slug"], members__user=self.request.user)
        return workspace.members.select_related("user").all()


class WorkspaceMemberDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self, slug, member_id, user):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=user)
        return get_object_or_404(WorkspaceMember, workspace=workspace, id=member_id), workspace

    def patch(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()

        if not is_admin:
            return Response({"detail": "Only admins can update member roles."}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = WorkspaceMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, slug, member_id):
        member, workspace = self.get_object(slug, member_id, request.user)
        if member.user == request.user:
            return Response({"detail": "You cannot remove yourself."}, status=status.HTTP_400_BAD_REQUEST)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        if not is_admin:
            return Response({"detail": "Only admins can remove members."}, status=status.HTTP_403_FORBIDDEN)
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteMemberView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        serializer = WorkspaceInviteSerializer(
            data=request.data,
            context={"request": request, "workspace": workspace}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceInviteListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        invites = workspace.invites.filter(status=WorkspaceInvite.Status.PENDING).select_related("invited_by")
        return Response(WorkspaceInviteSerializer(invites, many=True).data)

    def delete(self, request, slug):
        """Cancel all pending invites for a given email (bulk cancel not used — see token endpoint)."""
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)


class WorkspaceInviteCancelView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, slug, token):
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        if not is_admin:
            return Response({"detail": "Only admins can cancel invites."}, status=status.HTTP_403_FORBIDDEN)
        invite = get_object_or_404(WorkspaceInvite, token=token, workspace=workspace)
        invite.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteDetailView(APIView):
    """Public endpoint — returns invite info so the accept page can display it before login."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        invite = get_object_or_404(WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING)
        return Response({
            "token": str(invite.token),
            "email": invite.email,
            "role": invite.role,
            "workspace": {"name": invite.workspace.name, "slug": invite.workspace.slug},
            "invited_by": invite.invited_by.full_name or invite.invited_by.email,
        })


class AcceptInviteView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, token):
        invite = get_object_or_404(WorkspaceInvite, token=token, status=WorkspaceInvite.Status.PENDING)
        if invite.email != request.user.email:
            return Response({"detail": "This invite is for a different email address."}, status=status.HTTP_403_FORBIDDEN)
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
        return Response(WorkspaceSerializer(invite.workspace, context={"request": request}).data)


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        notifs = Notification.objects.filter(recipient=request.user).select_related("actor")[:50]
        return Response(NotificationSerializer(notifs, many=True).data)


class NotificationMarkReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        notif_id = request.data.get("id")
        if notif_id:
            Notification.objects.filter(id=notif_id, recipient=request.user).update(read=True)
        else:
            Notification.objects.filter(recipient=request.user, read=False).update(read=True)
        return Response({"status": "ok"})


# ── v3.7.0 — Inbox ────────────────────────────────────────────────────────────

class InboxListView(APIView):
    """
    GET /api/inbox/?workspace=<slug>&tab=<for_you|all|done>&event_type=<type>
    Returns InboxItems for the current user across all (or one) workspace.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        workspace_slug = request.query_params.get("workspace")
        tab            = request.query_params.get("tab", "for_you")
        event_type     = request.query_params.get("event_type")

        qs = InboxItem.objects.filter(user=request.user).select_related("workspace")

        if workspace_slug:
            qs = qs.filter(workspace__slug=workspace_slug)

        if tab == "for_you":
            qs = qs.filter(status__in=[InboxItem.Status.UNREAD, InboxItem.Status.READ])
        elif tab == "done":
            qs = qs.filter(status=InboxItem.Status.ARCHIVED)
        elif tab == "snoozed":
            qs = qs.filter(status=InboxItem.Status.SNOOZED)
        else:  # "all"
            qs = qs.exclude(status=InboxItem.Status.ARCHIVED)

        # Auto-unsnooze items whose snooze has expired
        qs.filter(status=InboxItem.Status.SNOOZED, snoozed_until__lte=timezone.now()).update(
            status=InboxItem.Status.UNREAD, snoozed_until=None
        )

        if event_type:
            qs = qs.filter(event_type=event_type)

        return Response(InboxItemSerializer(qs[:100], many=True).data)


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
        ids    = request.data.get("ids", [])
        action = request.data.get("action")  # "read" | "archive" | "snooze"
        snooze_until = request.data.get("snoozed_until")

        if action not in ["read", "archive", "snooze"]:
            return Response({"detail": "action must be read, archive, or snooze."}, status=status.HTTP_400_BAD_REQUEST)

        qs = InboxItem.objects.filter(user=request.user, id__in=ids)

        if action == "read":
            qs.update(status=InboxItem.Status.READ)
            Notification.objects.filter(
                inbox_item__in=qs, read=False
            ).update(read=True)
        elif action == "archive":
            qs.update(status=InboxItem.Status.ARCHIVED)
        elif action == "snooze":
            if not snooze_until:
                return Response({"detail": "snoozed_until required."}, status=status.HTTP_400_BAD_REQUEST)
            qs.update(status=InboxItem.Status.SNOOZED, snoozed_until=snooze_until)

        return Response({"updated": qs.count()})


# ── v3.7.0 — Notification Preferences ────────────────────────────────────────

class NotificationPreferenceView(APIView):
    """
    GET  /api/workspaces/<slug>/notification-preferences/  — list prefs for workspace
    PUT  /api/workspaces/<slug>/notification-preferences/  — upsert prefs (accepts list)
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def get(self, request, slug):
        workspace = self._get_workspace(slug, request.user)
        prefs = NotificationPreference.objects.filter(user=request.user, workspace=workspace)
        return Response(NotificationPreferenceSerializer(prefs, many=True).data)

    def put(self, request, slug):
        workspace = self._get_workspace(slug, request.user)
        items = request.data if isinstance(request.data, list) else [request.data]
        result = []
        for item in items:
            pref, _ = NotificationPreference.objects.update_or_create(
                user=request.user,
                workspace=workspace,
                event_type=item.get("event_type"),
                project_id_override=item.get("project_id_override", ""),
                defaults={
                    "in_app":            item.get("in_app", True),
                    "email":             item.get("email", NotificationPreference.Frequency.INSTANT),
                    "quiet_hours_start": item.get("quiet_hours_start"),
                    "quiet_hours_end":   item.get("quiet_hours_end"),
                    "digest_hour":       item.get("digest_hour", 9),
                },
            )
            result.append(pref)
        return Response(NotificationPreferenceSerializer(result, many=True).data)


# ── v2.3.0 — Onboarding ───────────────────────────────────────────────────────

WORKSPACE_TEMPLATES = [
    {
        "key": "software",
        "name": "Software Team",
        "description": "Sprint-based engineering workflow with bug tracking and feature planning.",
        "icon": "💻",
        "projects": [
            {"name": "Sprint Board", "board_type": "scrum"},
            {"name": "Bug Tracker",  "board_type": "list"},
        ],
    },
    {
        "key": "startup",
        "name": "Startup",
        "description": "Move fast across product, engineering and growth with a unified board.",
        "icon": "🚀",
        "projects": [
            {"name": "Roadmap",     "board_type": "timeline"},
            {"name": "Sprint",      "board_type": "scrum"},
        ],
    },
    {
        "key": "design",
        "name": "Design Studio",
        "description": "Creative project tracking from brief to delivery.",
        "icon": "🎨",
        "projects": [
            {"name": "Active Projects", "board_type": "kanban"},
            {"name": "Client Requests", "board_type": "list"},
        ],
    },
    {
        "key": "marketing",
        "name": "Marketing Agency",
        "description": "Campaign pipeline, content calendar and asset management.",
        "icon": "📢",
        "projects": [
            {"name": "Campaigns",       "board_type": "kanban"},
            {"name": "Content Calendar","board_type": "calendar"},
        ],
    },
    {
        "key": "education",
        "name": "Education",
        "description": "Course planning, assignments and student project tracking.",
        "icon": "🎓",
        "projects": [
            {"name": "Curriculum",  "board_type": "list"},
            {"name": "Projects",    "board_type": "kanban"},
        ],
    },
    {
        "key": "operations",
        "name": "Operations",
        "description": "Process management, SOPs and cross-team coordination.",
        "icon": "⚙️",
        "projects": [
            {"name": "Processes",   "board_type": "list"},
            {"name": "OKRs",        "board_type": "kanban"},
        ],
    },
]


class OnboardingStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get_workspace(self, slug, user):
        return get_object_or_404(Workspace, slug=slug, members__user=user)

    def _checklist(self, workspace):
        from projects.models import Project, Task
        has_project  = Project.objects.filter(workspace=workspace).exists()
        has_task     = Task.objects.filter(project__workspace=workspace).exists()
        has_member   = WorkspaceMember.objects.filter(workspace=workspace).count() > 1
        return {
            "create_project":    has_project,
            "add_task":          has_task,
            "invite_teammate":   has_member,
            "connect_github":    False,  # future
            "setup_automation":  False,  # future
        }

    def _user_dismissed(self, state, user_id):
        """Per-user dismissal stored in a JSON list of user UUID strings."""
        return str(user_id) in (state.dismissed_by_users or [])

    def _build_response(self, state, workspace, request):
        user_id = str(request.user.id)
        user_is_admin = WorkspaceMember.objects.filter(
            workspace=workspace, user=request.user, role=WorkspaceMember.Role.ADMIN
        ).exists()
        return {
            "wizard_completed":    state.wizard_completed,
            "team_type":           state.team_type,
            # Per-user dismissal — each user can dismiss independently
            "checklist_dismissed": self._user_dismissed(state, user_id),
            "checklist":           self._checklist(workspace),
            # Only admins should see the setup checklist
            "user_is_admin":       user_is_admin,
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


class WorkspaceTemplateListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, slug):
        get_object_or_404(Workspace, slug=slug, members__user=request.user)
        return Response(WORKSPACE_TEMPLATES)


class WorkspaceTemplateApplyView(APIView):
    """Apply a template: create pre-configured projects + boards."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, slug):
        from projects.models import Project, TaskStatus, Board
        workspace = get_object_or_404(Workspace, slug=slug, members__user=request.user)
        key = request.data.get("template_key")
        tmpl = next((t for t in WORKSPACE_TEMPLATES if t["key"] == key), None)
        if not tmpl:
            return Response({"detail": "Template not found."}, status=status.HTTP_400_BAD_REQUEST)

        created_projects = []
        for proj_conf in tmpl["projects"]:
            project = Project.objects.create(
                workspace=workspace,
                name=proj_conf["name"],
                created_by=request.user,
            )
            TaskStatus.objects.bulk_create([
                TaskStatus(project=project, **s) for s in [
                    {"name": "Backlog",     "color": "#94a3b8", "order": 0, "is_done": False},
                    {"name": "In Progress", "color": "#6366f1", "order": 1, "is_done": False},
                    {"name": "In Review",   "color": "#f59e0b", "order": 2, "is_done": False},
                    {"name": "Done",        "color": "#22c55e", "order": 3, "is_done": True},
                ]
            ])
            Board.objects.create(
                project=project,
                name="Main Board",
                board_type=proj_conf.get("board_type", "kanban"),
                is_default=True,
                visibility="public",
                created_by=request.user,
                order=0,
            )
            created_projects.append({"id": str(project.id), "name": project.name})

        return Response({"created_projects": created_projects}, status=status.HTTP_201_CREATED)


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
    GET  /api/workspaces/:slug/api-keys/  — list keys (prefix + meta only, never hash)
    POST /api/workspaces/:slug/api-keys/  — create key; returns raw key ONCE
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        keys = ws.api_keys.filter(is_active=True).order_by("-created_at")
        return Response([{
            "id":          str(k.id),
            "name":        k.name,
            "key_prefix":  k.key_prefix,
            "scopes":      k.scopes,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
            "expires_at":  k.expires_at.isoformat() if k.expires_at else None,
            "created_at":  k.created_at.isoformat(),
        } for k in keys])

    def post(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)

        name   = (request.data.get("name") or "").strip()
        scopes = request.data.get("scopes") or ["read"]
        exp    = request.data.get("expires_at")

        if not name:
            return Response({"error": "name required"}, status=400)

        expires_at = None
        if exp:
            try:
                from django.utils.dateparse import parse_datetime
                expires_at = parse_datetime(exp)
            except Exception:
                return Response({"error": "Invalid expires_at"}, status=400)

        key_obj, raw = WorkspaceAPIKey.generate(
            workspace=ws, name=name, scopes=scopes,
            created_by=request.user, expires_at=expires_at,
        )
        return Response({
            "id":         str(key_obj.id),
            "name":       key_obj.name,
            "key_prefix": key_obj.key_prefix,
            "scopes":     key_obj.scopes,
            "expires_at": key_obj.expires_at.isoformat() if key_obj.expires_at else None,
            "created_at": key_obj.created_at.isoformat(),
            "key":        raw,   # ← ONLY returned here; client must copy immediately
        }, status=201)


class APIKeyDetailView(APIView):
    """DELETE /api/workspaces/:slug/api-keys/:key_id/ — revoke a key."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug, key_id):
        ws  = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        key = get_object_or_404(WorkspaceAPIKey, id=key_id, workspace=ws)
        key.is_active = False
        key.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── v4.5.0 — Webhooks ─────────────────────────────────────────────────────────

WEBHOOK_EVENTS = [
    "task.created", "task.updated", "task.deleted",
    "task.assigned", "task.commented", "task.completed",
    "sprint.started", "sprint.completed",
    "member.added", "member.removed",
]


class WebhookListCreateView(APIView):
    """
    GET  /api/workspaces/:slug/webhooks/
    POST /api/workspaces/:slug/webhooks/
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hooks = ws.webhooks.all().order_by("-created_at")
        return Response([{
            "id":         str(h.id),
            "name":       h.name,
            "url":        h.url,
            "events":     h.events,
            "is_active":  h.is_active,
            "created_at": h.created_at.isoformat(),
            "secret_prefix": h.secret[:8] + "…",
        } for h in hooks])

    def post(self, request, workspace_slug):
        ws   = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        name   = (request.data.get("name") or "").strip()
        url    = (request.data.get("url") or "").strip()
        events = request.data.get("events") or WEBHOOK_EVENTS

        if not name or not url:
            return Response({"error": "name and url required"}, status=400)
        if not url.startswith(("http://", "https://")):
            return Response({"error": "url must start with http:// or https://"}, status=400)

        hook = Webhook.create_with_secret(workspace=ws, name=name, url=url, events=events)
        return Response({
            "id":         str(hook.id),
            "name":       hook.name,
            "url":        hook.url,
            "events":     hook.events,
            "is_active":  hook.is_active,
            "secret":     hook.secret,  # returned ONCE at creation
            "created_at": hook.created_at.isoformat(),
        }, status=201)


class WebhookDetailView(APIView):
    """PATCH/DELETE /api/workspaces/:slug/webhooks/:hook_id/"""
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, workspace_slug, hook_id):
        ws   = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        for field in ("name", "url", "events", "is_active"):
            if field in request.data:
                setattr(hook, field, request.data[field])
        hook.save()
        return Response({
            "id": str(hook.id), "name": hook.name,
            "url": hook.url, "events": hook.events, "is_active": hook.is_active,
        })

    def delete(self, request, workspace_slug, hook_id):
        ws   = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        hook.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WebhookTestView(APIView):
    """POST /api/workspaces/:slug/webhooks/:hook_id/test/ — send a test event."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug, hook_id):
        ws   = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        from workspaces.tasks import deliver_webhook
        payload = {
            "event":  "ping",
            "hook_id": str(hook.id),
            "workspace": ws.slug,
        }
        deliver_webhook.delay(str(hook.id), "ping", payload)
        return Response({"ok": True, "message": "Test event queued"})


class WebhookDeliveryListView(APIView):
    """GET /api/workspaces/:slug/webhooks/:hook_id/deliveries/"""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, hook_id):
        ws   = get_object_or_404(Workspace, slug=workspace_slug)
        _require_admin(ws, request.user)
        hook = get_object_or_404(Webhook, id=hook_id, workspace=ws)
        deliveries = hook.deliveries.order_by("-created_at")[:50]
        return Response([{
            "id":            str(d.id),
            "event":         d.event,
            "response_code": d.response_code,
            "response_body": d.response_body[:500],
            "duration_ms":   d.duration_ms,
            "success":       d.success,
            "attempt":       d.attempt,
            "created_at":    d.created_at.isoformat(),
        } for d in deliveries])
