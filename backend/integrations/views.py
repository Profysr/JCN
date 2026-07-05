import logging
import requests
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.events import CHAT_EVENTS, verb_label
from workspaces import access
from .models import GoogleChatIntegration, IntegrationChannelMapping, TeamsIntegration
from .serializers import (
    GoogleChatIntegrationSerializer,
    IntegrationChannelMappingSerializer,
    TeamsIntegrationSerializer,
)

logger = logging.getLogger(__name__)


# ==============================================================================
# ── SHARED INTEGRATION UTILITIES ──────────────────────────────────────────────
# ==============================================================================


def _read_ws(request, workspace_id):
    """Integration reads (status, config view, mapping list) — any member, read scope."""
    return access.authorize(request, workspace_id, scope="read")


def _admin_ws(request, workspace_id):
    """Integration config changes — workspace admin, admin scope. Outbound webhook
    delivery config is workspace-admin trust (see backend/ACCESS.md)."""
    return access.authorize(request, workspace_id, admin=True, scope="admin")


def _ensure_default_mapping(ws, platform):
    """Creates a fallback workspace-wide mapping if it does not already exist."""
    IntegrationChannelMapping.objects.get_or_create(
        workspace=ws,
        board=None,
        platform=platform,
        defaults={
            "notification_format": "detailed",
            "enabled_events": list(CHAT_EVENTS),
            "is_active": True,
        },
    )


def _test_webhook(url, payload):
    """Fires a safe, structured outbound network request to check a remote webhook."""
    try:
        resp = requests.post(url, json=payload, timeout=8)
        if resp.status_code >= 400:
            return False, Response(
                {"error": f"Webhook returned status code {resp.status_code}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )
    except Exception as exc:
        return False, Response(
            {"error": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    return True, None


def _get_teams_data_or_none(ws):
    """Safely extracts serializable MS Teams integration data or None."""
    try:
        return TeamsIntegrationSerializer(ws.teams_integration).data
    except TeamsIntegration.DoesNotExist:
        return None


def _get_gchat_data_or_none(ws):
    """Safely extracts serializable Google Chat integration data or None."""
    try:
        return GoogleChatIntegrationSerializer(ws.google_chat_integration).data
    except GoogleChatIntegration.DoesNotExist:
        return None


# ==============================================================================
# ── INTEGRATION MONITORING & STATUS ───────────────────────────────────────────
# ==============================================================================


class IntegrationStatusView(APIView):
    """Returns the current workspace connection state across all supported external ecosystems."""

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        ws = _read_ws(request, workspace_id)
        return Response(
            {
                "teams": _get_teams_data_or_none(ws),
                "google_chat": _get_gchat_data_or_none(ws),
            },
            status=status.HTTP_200_OK,
        )


class IntegrationEventsView(APIView):
    """The chat-notifiable events a channel mapping can subscribe to — derived
    from core.events.EVENTS (every event with a chat surface) so the picker
    can't drift from what actually gets delivered. Labels come from the shared
    NOTIFICATION_VERBS registry."""

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        _read_ws(request, workspace_id)
        return Response(
            [{"value": v, "label": verb_label(v)} for v in CHAT_EVENTS],
            status=status.HTTP_200_OK,
        )


# ==============================================================================
# ── MICROSOFT TEAMS INTEGRATION ───────────────────────────────────────────────
# ==============================================================================


class TeamsIntegrationView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        ws = _read_ws(request, workspace_id)
        return Response(_get_teams_data_or_none(ws), status=status.HTTP_200_OK)

    def put(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        s = TeamsIntegrationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        integration = s.save(workspace=ws)

        _ensure_default_mapping(ws, IntegrationChannelMapping.Platform.TEAMS)
        return Response(
            TeamsIntegrationSerializer(integration).data, status=status.HTTP_200_OK
        )

    def delete(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        TeamsIntegration.objects.filter(workspace=ws).delete()
        IntegrationChannelMapping.objects.filter(
            workspace=ws, platform=IntegrationChannelMapping.Platform.TEAMS
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamsTestView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def post(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        try:
            integration = ws.teams_integration
        except TeamsIntegration.DoesNotExist:
            return Response(
                {"error": "Teams is not connected yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = {
            "@type": "MessageCard",
            "@context": "https://schema.org/extensions",
            "themeColor": "6366f1",
            "summary": "JCN Test Message",
            "sections": [
                {
                    "activityTitle": "**JCN → Teams connected ✅**",
                    "activitySubtitle": f"Workspace: {ws.name}",
                    "activityText": "Notifications will appear here for task events you configure.",
                }
            ],
        }
        ok, err = _test_webhook(integration.webhook_url, payload)
        return Response({"ok": True}, status=status.HTTP_200_OK) if ok else err


# ==============================================================================
# ── GOOGLE CHAT INTEGRATION ───────────────────────────────────────────────────
# ==============================================================================


class GoogleChatIntegrationView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        ws = _read_ws(request, workspace_id)
        return Response(_get_gchat_data_or_none(ws), status=status.HTTP_200_OK)

    def put(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        s = GoogleChatIntegrationSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        integration = s.save(workspace=ws)

        _ensure_default_mapping(ws, IntegrationChannelMapping.Platform.GOOGLE_CHAT)
        return Response(
            GoogleChatIntegrationSerializer(integration).data, status=status.HTTP_200_OK
        )

    def delete(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        GoogleChatIntegration.objects.filter(workspace=ws).delete()
        IntegrationChannelMapping.objects.filter(
            workspace=ws, platform=IntegrationChannelMapping.Platform.GOOGLE_CHAT
        ).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GoogleChatTestView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def post(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        try:
            integration = ws.google_chat_integration
        except GoogleChatIntegration.DoesNotExist:
            return Response(
                {"error": "Google Chat is not connected yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        payload = {
            "text": (
                f"*JCN → Google Chat connected ✅*\n"
                f"Workspace: *{ws.name}*\n"
                f"Notifications will appear here for task events you configure."
            )
        }
        ok, err = _test_webhook(integration.webhook_url, payload)
        return Response({"ok": True}, status=status.HTTP_200_OK) if ok else err


# ==============================================================================
# ── GRANULAR ROUTING & CHANNEL MAPPINGS ───────────────────────────────────────
# ==============================================================================


class ChannelMappingListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        ws = _read_ws(request, workspace_id)
        qs = IntegrationChannelMapping.objects.filter(workspace=ws).select_related(
            "board"
        )

        platform = request.query_params.get("platform")
        if platform:
            qs = qs.filter(platform=platform)

        return Response(
            IntegrationChannelMappingSerializer(qs, many=True).data,
            status=status.HTTP_200_OK,
        )

    def post(self, request, workspace_id):
        ws = _admin_ws(request, workspace_id)
        s = IntegrationChannelMappingSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(
            IntegrationChannelMappingSerializer(s.save(workspace=ws)).data,
            status=status.HTTP_201_CREATED,
        )


class ChannelMappingDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def _get_mapping(self, request, workspace_id, mapping_id):
        ws = _admin_ws(request, workspace_id)
        return get_object_or_404(
            IntegrationChannelMapping, id=mapping_id, workspace=ws
        )

    def patch(self, request, workspace_id, mapping_id):
        mapping = self._get_mapping(request, workspace_id, mapping_id)
        s = IntegrationChannelMappingSerializer(
            mapping, data=request.data, partial=True
        )
        s.is_valid(raise_exception=True)
        updated = s.save()
        return Response(
            IntegrationChannelMappingSerializer(updated).data, status=status.HTTP_200_OK
        )

    def delete(self, request, workspace_id, mapping_id):
        self._get_mapping(request, workspace_id, mapping_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
