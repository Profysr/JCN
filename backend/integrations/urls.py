from django.urls import path
from .views import (
    IntegrationStatusView,
    SlackOAuthBeginView, SlackOAuthCallbackView, SlackDisconnectView, SlackChannelsView,
    SlackEventsView, SlackInteractiveView,
    TeamsIntegrationView, TeamsTestView,
    GoogleChatIntegrationView, GoogleChatTestView,
    ChannelMappingListCreateView, ChannelMappingDetailView,
)

_ws = "workspaces/<slug:workspace_slug>"

urlpatterns = [
    # ── Status (all platforms) ────────────────────────────────────────────────
    path(f"{_ws}/integrations/",                                    IntegrationStatusView.as_view()),

    # ── Slack ─────────────────────────────────────────────────────────────────
    path(f"{_ws}/integrations/slack/",                              SlackDisconnectView.as_view()),
    path(f"{_ws}/integrations/slack/channels/",                     SlackChannelsView.as_view()),

    # ── Teams ─────────────────────────────────────────────────────────────────
    path(f"{_ws}/integrations/teams/",                              TeamsIntegrationView.as_view()),
    path(f"{_ws}/integrations/teams/test/",                         TeamsTestView.as_view()),

    # ── Google Chat ───────────────────────────────────────────────────────────
    path(f"{_ws}/integrations/google-chat/",                        GoogleChatIntegrationView.as_view()),
    path(f"{_ws}/integrations/google-chat/test/",                   GoogleChatTestView.as_view()),

    # ── Channel mappings ──────────────────────────────────────────────────────
    path(f"{_ws}/integrations/mappings/",                           ChannelMappingListCreateView.as_view()),
    path(f"{_ws}/integrations/mappings/<uuid:mapping_id>/",         ChannelMappingDetailView.as_view()),

    # ── Slack OAuth (browser redirects — no auth required) ────────────────────
    path("integrations/slack/oauth/begin/",                         SlackOAuthBeginView.as_view()),
    path("integrations/slack/oauth/callback/",                      SlackOAuthCallbackView.as_view()),

    # ── Slack inbound (Events API + Interactive) ──────────────────────────────
    path("integrations/slack/events/",                              SlackEventsView.as_view()),
    path("integrations/slack/interactive/",                         SlackInteractiveView.as_view()),
]
