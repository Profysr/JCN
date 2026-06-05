"""
Integration views for Slack OAuth, Teams webhook, Google Chat webhook,
channel mappings, slash commands, and interactive messages.
"""
import hashlib
import hmac
import json
import logging
import time

import requests
from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.views import View
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from workspaces.models import Workspace

from .models import (
    GoogleChatIntegration,
    IntegrationChannelMapping,
    SlackCommandLog,
    SlackIntegration,
    TeamsIntegration,
)
from .serializers import (
    GoogleChatIntegrationSerializer,
    IntegrationChannelMappingSerializer,
    SlackIntegrationSerializer,
    TeamsIntegrationSerializer,
)
from .services import send_teams, send_google_chat, format_teams_card, format_google_chat_card

logger = logging.getLogger(__name__)

ALL_EVENTS = [
    "task_created", "task_assigned", "task_commented",
    "task_completed", "sprint_started", "sprint_completed", "approval_requested",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_workspace(slug, user):
    """Return workspace if user is a member, else 404."""
    ws = get_object_or_404(Workspace, slug=slug)
    if not ws.members.filter(user=user).exists():
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied
    return ws


def _verify_slack_signature(request):
    """Returns True if the request carries a valid Slack signing secret."""
    signing_secret = getattr(settings, "SLACK_SIGNING_SECRET", "")
    if not signing_secret:
        return True  # skip verification in dev / when not configured

    ts  = request.headers.get("X-Slack-Request-Timestamp", "")
    sig = request.headers.get("X-Slack-Signature", "")

    if not ts or not sig:
        return False
    if abs(time.time() - float(ts)) > 300:
        return False   # replay attack guard

    base   = f"v0:{ts}:{request.body.decode()}"
    digest = "v0=" + hmac.new(
        signing_secret.encode(), base.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(digest, sig)


def _slack_configured():
    return bool(
        getattr(settings, "SLACK_CLIENT_ID", "") and
        getattr(settings, "SLACK_CLIENT_SECRET", "")
    )


# ── Integration status (all platforms) ───────────────────────────────────────

class IntegrationStatusView(APIView):
    """GET /api/workspaces/:slug/integrations/ — returns connection state of all platforms."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)

        slack_data, teams_data, gchat_data = None, None, None
        try:
            slack_data = SlackIntegrationSerializer(ws.slack_integration).data
        except SlackIntegration.DoesNotExist:
            pass
        try:
            teams_data = TeamsIntegrationSerializer(ws.teams_integration).data
        except TeamsIntegration.DoesNotExist:
            pass
        try:
            gchat_data = GoogleChatIntegrationSerializer(ws.google_chat_integration).data
        except GoogleChatIntegration.DoesNotExist:
            pass

        return Response({
            "slack":        slack_data,
            "teams":        teams_data,
            "google_chat":  gchat_data,
            "slack_oauth_configured": _slack_configured(),
        })


# ── Slack OAuth ────────────────────────────────────────────────────────────────

class SlackOAuthBeginView(View):
    """
    GET /api/integrations/slack/oauth/begin/?workspace_slug=xxx
    Redirects the browser to Slack's OAuth authorization screen.
    """

    def get(self, request):
        if not _slack_configured():
            return HttpResponse("Slack OAuth not configured on this server.", status=503)

        ws_slug      = request.GET.get("workspace_slug", "")
        redirect_uri = request.build_absolute_uri("/api/integrations/slack/oauth/callback/")

        # Scopes needed: post messages, read channels, handle slash commands
        scopes = (
            "chat:write,chat:write.public,"
            "channels:read,groups:read,"
            "commands,"
            "users:read,users:read.email,"
            "incoming-webhook"
        )

        url = (
            f"https://slack.com/oauth/v2/authorize"
            f"?client_id={settings.SLACK_CLIENT_ID}"
            f"&scope={scopes}"
            f"&redirect_uri={redirect_uri}"
            f"&state={ws_slug}"
        )
        return HttpResponseRedirect(url)


class SlackOAuthCallbackView(View):
    """
    GET /api/integrations/slack/oauth/callback/?code=xxx&state=workspace_slug
    Exchanges the code for a bot token and stores the SlackIntegration.
    Redirects to the frontend integrations page.
    """

    def get(self, request):
        code     = request.GET.get("code")
        ws_slug  = request.GET.get("state", "")
        error    = request.GET.get("error")

        frontend_base = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        fail_url      = f"{frontend_base}/w/{ws_slug}/settings/integrations?error=slack_oauth"
        success_url   = f"{frontend_base}/w/{ws_slug}/settings/integrations?connected=slack"

        if error or not code:
            return HttpResponseRedirect(fail_url + f"&detail={error or 'no_code'}")

        redirect_uri = request.build_absolute_uri("/api/integrations/slack/oauth/callback/")

        try:
            resp = requests.post(
                "https://slack.com/api/oauth.v2.access",
                data={
                    "client_id":     settings.SLACK_CLIENT_ID,
                    "client_secret": settings.SLACK_CLIENT_SECRET,
                    "code":          code,
                    "redirect_uri":  redirect_uri,
                },
                timeout=10,
            )
            data = resp.json()
        except Exception as exc:
            logger.error("Slack OAuth token exchange failed: %s", exc)
            return HttpResponseRedirect(fail_url + "&detail=request_failed")

        if not data.get("ok"):
            return HttpResponseRedirect(fail_url + f"&detail={data.get('error', 'unknown')}")

        ws = Workspace.objects.filter(slug=ws_slug).first()
        if not ws:
            return HttpResponseRedirect(fail_url + "&detail=workspace_not_found")

        # Upsert the integration
        SlackIntegration.objects.update_or_create(
            workspace=ws,
            defaults={
                "team_id":                  data["team"]["id"],
                "team_name":                data["team"]["name"],
                "bot_token":                data["access_token"],
                "bot_user_id":              data.get("bot_user_id", ""),
                "incoming_webhook_url":     data.get("incoming_webhook", {}).get("url", ""),
                "incoming_webhook_channel": data.get("incoming_webhook", {}).get("channel", ""),
                "is_active":                True,
            },
        )

        # Create a default workspace-wide Slack mapping if none exists
        IntegrationChannelMapping.objects.get_or_create(
            workspace=ws,
            project=None,
            platform=IntegrationChannelMapping.Platform.SLACK,
            defaults={
                "channel_name":         data.get("incoming_webhook", {}).get("channel", ""),
                "notification_format":  "detailed",
                "enabled_events":       ALL_EVENTS,
                "is_active":            True,
            },
        )

        return HttpResponseRedirect(success_url)


class SlackDisconnectView(APIView):
    """DELETE /api/workspaces/:slug/integrations/slack/ — revoke and remove."""
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            integration = ws.slack_integration
            # Best-effort Slack token revocation
            try:
                requests.post(
                    "https://slack.com/api/auth.revoke",
                    headers={"Authorization": f"Bearer {integration.bot_token}"},
                    timeout=5,
                )
            except Exception:
                pass
            integration.delete()
        except SlackIntegration.DoesNotExist:
            pass
        # Remove Slack channel mappings
        IntegrationChannelMapping.objects.filter(
            workspace=ws, platform=IntegrationChannelMapping.Platform.SLACK
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SlackChannelsView(APIView):
    """
    GET /api/workspaces/:slug/integrations/slack/channels/
    Returns a list of channels the bot has access to (public + bot-joined private).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            integration = ws.slack_integration
        except SlackIntegration.DoesNotExist:
            return Response({"error": "Slack not connected"}, status=404)

        try:
            resp = requests.get(
                "https://slack.com/api/conversations.list",
                headers={"Authorization": f"Bearer {integration.bot_token}"},
                params={"types": "public_channel,private_channel", "limit": 200},
                timeout=8,
            )
            data = resp.json()
        except Exception as exc:
            return Response({"error": str(exc)}, status=503)

        if not data.get("ok"):
            return Response({"error": data.get("error", "unknown")}, status=502)

        channels = [
            {"id": c["id"], "name": c["name"], "is_private": c.get("is_private", False)}
            for c in data.get("channels", [])
        ]
        return Response({"channels": channels})


# ── Slack Events (slash commands + interactive) ───────────────────────────────

class SlackEventsView(APIView):
    """
    POST /api/integrations/slack/events/
    Handles Slack Events API payloads: slash commands and url_verification.
    """
    permission_classes = []  # Slack sends unsigned requests for url_verification initially
    authentication_classes = []

    def post(self, request):
        if not _verify_slack_signature(request):
            return Response({"error": "Invalid signature"}, status=403)

        body = request.data

        # URL verification challenge (required when first setting up the app)
        if body.get("type") == "url_verification":
            return Response({"challenge": body["challenge"]})

        # Slash command (Slack sends form-encoded, DRF parses it)
        command = body.get("command", "")
        if command == "/jcn":
            return self._handle_slash(request, body)

        return Response({"ok": True})

    def _handle_slash(self, request, body):
        text      = (body.get("text") or "").strip()
        team_id   = body.get("team_id", "")
        user_id   = body.get("user_id", "")
        parts     = text.split(maxsplit=1)
        sub_cmd   = parts[0].lower() if parts else "help"
        args      = parts[1] if len(parts) > 1 else ""

        ws = SlackIntegration.objects.filter(team_id=team_id).select_related("workspace").first()
        workspace = ws.workspace if ws else None

        # Log the command
        SlackCommandLog.objects.create(
            workspace=workspace,
            slack_user_id=user_id,
            slack_team_id=team_id,
            command="/jcn",
            text=text,
        )

        if not workspace:
            return Response(self._eph("⚠️ Workspace not found. Has Slack been connected to JCN?"))

        handlers = {
            "create": self._cmd_create,
            "list":   self._cmd_list,
            "status": self._cmd_status,
            "assign": self._cmd_assign,
            "help":   self._cmd_help,
        }
        handler = handlers.get(sub_cmd, self._cmd_help)
        response_text = handler(ws, user_id, args)

        # Save response text in log
        SlackCommandLog.objects.filter(
            slack_user_id=user_id, slack_team_id=team_id, command="/jcn"
        ).order_by("-created_at").update(response_text=response_text[:500])

        return Response(self._eph(response_text))

    # ── Slash command handlers ─────────────────────────────────────────────

    def _slack_user_email(self, bot_token, slack_user_id):
        """Lookup a Slack user's email using the bot token."""
        try:
            resp = requests.get(
                "https://slack.com/api/users.info",
                headers={"Authorization": f"Bearer {bot_token}"},
                params={"user": slack_user_id},
                timeout=5,
            )
            d = resp.json()
            return d.get("user", {}).get("profile", {}).get("email", "")
        except Exception:
            return ""

    def _jcn_user(self, slack_integration, slack_user_id):
        """Return a JCN User matching the Slack user's email, or None."""
        from django.contrib.auth import get_user_model
        email = self._slack_user_email(slack_integration.bot_token, slack_user_id)
        if not email:
            return None
        User = get_user_model()
        return User.objects.filter(email__iexact=email).first()

    def _cmd_create(self, slack_integration, slack_user_id, args):
        if not args:
            return "Usage: `/jcn create <task title>`"
        user = self._jcn_user(slack_integration, slack_user_id)
        if not user:
            return "⚠️ Link your JCN account: your Slack email must match your JCN email."

        workspace = slack_integration.workspace
        from projects.models import Project, Task, TaskStatus
        project = workspace.projects.filter(is_archived=False).order_by("created_at").first()
        if not project:
            return "⚠️ No active project found in this workspace."

        first_status = TaskStatus.objects.filter(project=project).order_by("order").first()
        task = Task.objects.create(
            project=project,
            title=args[:255],
            status=first_status,
            created_by=user,
            priority="medium",
        )
        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        url = f"{frontend}/w/{workspace.slug}/projects/{project.id}?task={task.id}"
        return f"✅ Task created: *<{url}|{task.title}>* in _{project.name}_"

    def _cmd_list(self, slack_integration, slack_user_id, args):
        workspace = slack_integration.workspace
        from projects.models import Task
        tasks = Task.objects.filter(
            project__workspace=workspace,
            status__is_done=False,
        ).select_related("project", "status", "assignee").order_by("-created_at")[:8]
        if not tasks:
            return "No open tasks found."

        lines = ["*Open tasks:*"]
        frontend = getattr(settings, "FRONTEND_URL", "http://localhost:5173")
        for t in tasks:
            url  = f"{frontend}/w/{workspace.slug}/projects/{t.project_id}?task={t.id}"
            assignee = (t.assignee.full_name or t.assignee.email.split("@")[0]) if t.assignee else "Unassigned"
            lines.append(f"• <{url}|{t.title}> — {t.status.name} · {assignee}")
        return "\n".join(lines)

    def _cmd_status(self, slack_integration, slack_user_id, args):
        parts = args.split(maxsplit=1)
        if len(parts) < 2:
            return "Usage: `/jcn status <task-title-keyword> <new-status-name>`"
        keyword, new_status_name = parts

        workspace = slack_integration.workspace
        user = self._jcn_user(slack_integration, slack_user_id)
        if not user:
            return "⚠️ Link your JCN account first."

        from projects.models import Task, TaskStatus
        task = Task.objects.filter(
            project__workspace=workspace,
            title__icontains=keyword,
        ).first()
        if not task:
            return f"⚠️ No task matching '{keyword}' found."

        new_status = TaskStatus.objects.filter(
            project=task.project,
            name__icontains=new_status_name,
        ).first()
        if not new_status:
            return f"⚠️ Status '{new_status_name}' not found in project _{task.project.name}_."

        task.status = new_status
        task.save(update_fields=["status"])
        return f"✅ *{task.title}* → _{new_status.name}_"

    def _cmd_assign(self, slack_integration, slack_user_id, args):
        parts = args.split(maxsplit=1)
        if len(parts) < 2:
            return "Usage: `/jcn assign <task-title-keyword> <@slack-user or email>`"
        keyword, assignee_hint = parts

        workspace = slack_integration.workspace
        from projects.models import Task
        from django.contrib.auth import get_user_model
        User = get_user_model()

        task = Task.objects.filter(
            project__workspace=workspace,
            title__icontains=keyword,
        ).first()
        if not task:
            return f"⚠️ No task matching '{keyword}' found."

        # Try to find the assignee by email
        email = assignee_hint.strip("<>@").replace("mailto:", "")
        assignee = User.objects.filter(email__icontains=email).first()
        if not assignee:
            return f"⚠️ User '{assignee_hint}' not found in JCN."

        task.assignee = assignee
        task.save(update_fields=["assignee"])
        return f"✅ *{task.title}* assigned to _{assignee.full_name or assignee.email}_"

    def _cmd_help(self, *_):
        return (
            "*JCN slash commands:*\n"
            "• `/jcn create <title>` — create a new task\n"
            "• `/jcn list` — list recent open tasks\n"
            "• `/jcn status <keyword> <status>` — update a task's status\n"
            "• `/jcn assign <keyword> <email>` — assign a task\n"
            "• `/jcn help` — show this message"
        )

    @staticmethod
    def _eph(text):
        """Ephemeral Slack response (only visible to the invoking user)."""
        return {"response_type": "ephemeral", "text": text}


class SlackInteractiveView(APIView):
    """
    POST /api/integrations/slack/interactive/
    Handles button clicks from interactive Slack messages (approve / snooze).
    """
    permission_classes = []
    authentication_classes = []

    def post(self, request):
        if not _verify_slack_signature(request):
            return Response({"error": "Invalid signature"}, status=403)

        raw = request.POST.get("payload", "{}")
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return Response({"error": "Bad payload"}, status=400)

        actions     = payload.get("actions", [])
        team_id     = payload.get("team", {}).get("id", "")
        slack_user  = payload.get("user", {}).get("id", "")

        for action in actions:
            action_id = action.get("action_id", "")
            value     = action.get("value", "")

            if action_id == "open_task":
                # Simple acknowledgement — the button URL handles navigation
                pass
            elif action_id == "approve_task":
                self._handle_approve(team_id, slack_user, value)
            elif action_id == "snooze_notification":
                pass  # Snooze logic deferred

        return Response({"response_action": "clear"})

    def _handle_approve(self, team_id, slack_user_id, task_id):
        integration = SlackIntegration.objects.filter(team_id=team_id).first()
        if not integration:
            return
        from django.contrib.auth import get_user_model
        email = SlackEventsView()._slack_user_email(integration.bot_token, slack_user_id)
        if not email:
            return
        User = get_user_model()
        user = User.objects.filter(email__iexact=email).first()
        if not user:
            return
        from projects.models import Task
        from projects.models import Approval
        try:
            task     = Task.objects.get(id=task_id)
            approval = Approval.objects.filter(task=task, status="pending").first()
            if approval:
                from projects.models import ApprovalReviewer
                reviewer = ApprovalReviewer.objects.filter(approval=approval, user=user).first()
                if reviewer:
                    import django.utils.timezone as tz
                    reviewer.status = "approved"
                    reviewer.reviewed_at = tz.now()
                    reviewer.save(update_fields=["status", "reviewed_at"])
        except Exception as exc:
            logger.warning("SlackInteractive approve failed: %s", exc)


# ── Teams ─────────────────────────────────────────────────────────────────────

class TeamsIntegrationView(APIView):
    """
    GET/PUT/DELETE /api/workspaces/:slug/integrations/teams/
    Manages a workspace's Teams incoming webhook.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            return Response(TeamsIntegrationSerializer(ws.teams_integration).data)
        except TeamsIntegration.DoesNotExist:
            return Response(None)

    def put(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        webhook_url  = request.data.get("webhook_url", "").strip()
        display_name = request.data.get("display_name", "JCN").strip() or "JCN"

        if not webhook_url:
            return Response({"error": "webhook_url required"}, status=400)

        integration, _ = TeamsIntegration.objects.update_or_create(
            workspace=ws,
            defaults={"webhook_url": webhook_url, "display_name": display_name, "is_active": True},
        )
        # Ensure a workspace-wide mapping exists
        IntegrationChannelMapping.objects.get_or_create(
            workspace=ws,
            project=None,
            platform=IntegrationChannelMapping.Platform.TEAMS,
            defaults={"notification_format": "detailed", "enabled_events": ALL_EVENTS, "is_active": True},
        )
        return Response(TeamsIntegrationSerializer(integration).data)

    def delete(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        TeamsIntegration.objects.filter(workspace=ws).delete()
        IntegrationChannelMapping.objects.filter(
            workspace=ws, platform=IntegrationChannelMapping.Platform.TEAMS
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamsTestView(APIView):
    """POST /api/workspaces/:slug/integrations/teams/test/ — sends a test card."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            integration = ws.teams_integration
        except TeamsIntegration.DoesNotExist:
            return Response({"error": "Teams not connected"}, status=404)

        payload = {
            "@type":      "MessageCard",
            "@context":   "https://schema.org/extensions",
            "themeColor": "6366f1",
            "summary":    "JCN Test Message",
            "sections": [
                {
                    "activityTitle":    "**JCN → Teams connected ✅**",
                    "activitySubtitle": f"Workspace: {ws.name}",
                    "activityText":     "Notifications will appear here for task events you configure.",
                }
            ],
        }
        try:
            resp = requests.post(integration.webhook_url, json=payload, timeout=8)
            if resp.status_code >= 400:
                return Response({"error": f"Teams returned {resp.status_code}"}, status=502)
        except Exception as exc:
            return Response({"error": str(exc)}, status=503)
        return Response({"ok": True})


# ── Google Chat ───────────────────────────────────────────────────────────────

class GoogleChatIntegrationView(APIView):
    """
    GET/PUT/DELETE /api/workspaces/:slug/integrations/google-chat/
    Manages a workspace's Google Chat incoming webhook.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            return Response(GoogleChatIntegrationSerializer(ws.google_chat_integration).data)
        except GoogleChatIntegration.DoesNotExist:
            return Response(None)

    def put(self, request, workspace_slug):
        ws          = _get_workspace(workspace_slug, request.user)
        webhook_url = request.data.get("webhook_url", "").strip()
        space_name  = request.data.get("space_name", "").strip()

        if not webhook_url:
            return Response({"error": "webhook_url required"}, status=400)

        integration, _ = GoogleChatIntegration.objects.update_or_create(
            workspace=ws,
            defaults={"webhook_url": webhook_url, "space_name": space_name, "is_active": True},
        )
        IntegrationChannelMapping.objects.get_or_create(
            workspace=ws,
            project=None,
            platform=IntegrationChannelMapping.Platform.GOOGLE_CHAT,
            defaults={"notification_format": "detailed", "enabled_events": ALL_EVENTS, "is_active": True},
        )
        return Response(GoogleChatIntegrationSerializer(integration).data)

    def delete(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        GoogleChatIntegration.objects.filter(workspace=ws).delete()
        IntegrationChannelMapping.objects.filter(
            workspace=ws, platform=IntegrationChannelMapping.Platform.GOOGLE_CHAT
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleChatTestView(APIView):
    """POST /api/workspaces/:slug/integrations/google-chat/test/ — sends a test message."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        try:
            integration = ws.google_chat_integration
        except GoogleChatIntegration.DoesNotExist:
            return Response({"error": "Google Chat not connected"}, status=404)

        payload = {
            "text": f"*JCN → Google Chat connected ✅*\nWorkspace: *{ws.name}*\nNotifications will appear here for task events you configure."
        }
        try:
            resp = requests.post(integration.webhook_url, json=payload, timeout=8)
            if resp.status_code >= 400:
                return Response({"error": f"Google Chat returned {resp.status_code}"}, status=502)
        except Exception as exc:
            return Response({"error": str(exc)}, status=503)
        return Response({"ok": True})


# ── Channel Mappings ──────────────────────────────────────────────────────────

class ChannelMappingListCreateView(APIView):
    """
    GET  /api/workspaces/:slug/integrations/mappings/  — list all mappings
    POST /api/workspaces/:slug/integrations/mappings/  — create a mapping
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        platform = request.query_params.get("platform")
        qs = IntegrationChannelMapping.objects.filter(workspace=ws).select_related("project")
        if platform:
            qs = qs.filter(platform=platform)
        return Response(IntegrationChannelMappingSerializer(qs, many=True).data)

    def post(self, request, workspace_slug):
        ws = _get_workspace(workspace_slug, request.user)
        s  = IntegrationChannelMappingSerializer(data=request.data)
        if not s.is_valid():
            return Response(s.errors, status=400)
        mapping = s.save(workspace=ws)
        return Response(IntegrationChannelMappingSerializer(mapping).data, status=201)


class ChannelMappingDetailView(APIView):
    """
    PATCH /api/workspaces/:slug/integrations/mappings/:id/
    DELETE /api/workspaces/:slug/integrations/mappings/:id/
    """
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_slug, mapping_id, user):
        ws = _get_workspace(workspace_slug, user)
        return get_object_or_404(IntegrationChannelMapping, id=mapping_id, workspace=ws)

    def patch(self, request, workspace_slug, mapping_id):
        mapping = self._get(workspace_slug, mapping_id, request.user)
        s = IntegrationChannelMappingSerializer(mapping, data=request.data, partial=True)
        if not s.is_valid():
            return Response(s.errors, status=400)
        return Response(IntegrationChannelMappingSerializer(s.save()).data)

    def delete(self, request, workspace_slug, mapping_id):
        self._get(workspace_slug, mapping_id, request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
