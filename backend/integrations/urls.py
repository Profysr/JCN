from django.urls import path
from .views import (
    IntegrationStatusView,
    IntegrationEventsView,
    TeamsIntegrationView,
    TeamsTestView,
    GoogleChatIntegrationView,
    GoogleChatTestView,
    ChannelMappingListCreateView,
    ChannelMappingDetailView,
)

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # ── Status (all platforms) ────────────────────────────────────────────────
    path(f"{_ws}/integrations/", IntegrationStatusView.as_view()),
    # ── Subscribable events (derived from core.events.EVENTS) ─────────────────
    path(f"{_ws}/integrations/events/", IntegrationEventsView.as_view()),
    # ── Teams ─────────────────────────────────────────────────────────────────
    path(f"{_ws}/integrations/teams/", TeamsIntegrationView.as_view()),
    path(f"{_ws}/integrations/teams/test/", TeamsTestView.as_view()),
    # ── Google Chat ───────────────────────────────────────────────────────────
    path(f"{_ws}/integrations/google-chat/", GoogleChatIntegrationView.as_view()),
    path(f"{_ws}/integrations/google-chat/test/", GoogleChatTestView.as_view()),
    # ── Channel mappings ──────────────────────────────────────────────────────
    path(f"{_ws}/integrations/mappings/", ChannelMappingListCreateView.as_view()),
    path(f"{_ws}/integrations/mappings/<str:mapping_id>/", ChannelMappingDetailView.as_view()),
]
