from django.urls import path
from .views import (
    WorkspaceListCreateView,
    WorkspaceDetailView,
    WorkspaceMemberListView,
    WorkspaceMemberDetailView,
    InviteMemberView,
    WorkspaceInviteListView,
    WorkspaceInviteCancelView,
    InviteDetailView,
    AcceptInviteView,
    NotificationListView,
    NotificationMarkReadView,
    OnboardingStateView,
    WorkspaceTemplateListView,
    WorkspaceTemplateApplyView,
    InboxListView,
    InboxItemUpdateView,
    InboxBulkUpdateView,
    InboxUnreadCountView,
    NotificationPreferenceView,
    # v4.5.0
    APIKeyListCreateView,
    APIKeyDetailView,
    WebhookListCreateView,
    WebhookDetailView,
    WebhookTestView,
    WebhookDeliveryListView,
)

urlpatterns = [
    # Workspaces
    path("workspaces/", WorkspaceListCreateView.as_view()),
    path("workspaces/<slug:slug>/", WorkspaceDetailView.as_view()),
    # Members
    path("workspaces/<slug:slug>/members/", WorkspaceMemberListView.as_view()),
    path(
        "workspaces/<slug:slug>/members/<uuid:member_id>/",
        WorkspaceMemberDetailView.as_view(),
    ),
    # Invites
    path("workspaces/<slug:slug>/invites/", InviteMemberView.as_view()),
    path("workspaces/<slug:slug>/invites/pending/", WorkspaceInviteListView.as_view()),
    path(
        "workspaces/<slug:slug>/invites/<uuid:token>/",
        WorkspaceInviteCancelView.as_view(),
    ),
    # Public invite accept flow
    path("invites/<uuid:token>/", InviteDetailView.as_view()),
    path("invites/<uuid:token>/accept/", AcceptInviteView.as_view()),
    # Notifications
    path("notifications/", NotificationListView.as_view()),
    path("notifications/mark-read/", NotificationMarkReadView.as_view()),
    # Onboarding (v2.3.0)
    path("workspaces/<slug:slug>/onboarding/", OnboardingStateView.as_view()),
    path("workspaces/<slug:slug>/templates/", WorkspaceTemplateListView.as_view()),
    path(
        "workspaces/<slug:slug>/templates/apply/", WorkspaceTemplateApplyView.as_view()
    ),
    # v3.7.0 — Inbox + Notification Preferences
    path("inbox/", InboxListView.as_view()),
    path("inbox/bulk/", InboxBulkUpdateView.as_view()),
    path("inbox/unread-count/", InboxUnreadCountView.as_view()),
    path("inbox/<uuid:item_id>/", InboxItemUpdateView.as_view()),
    path(
        "workspaces/<slug:slug>/notification-preferences/",
        NotificationPreferenceView.as_view(),
    ),
    # v4.5.0 — API Keys
    path("workspaces/<slug:workspace_slug>/api-keys/", APIKeyListCreateView.as_view()),
    path(
        "workspaces/<slug:workspace_slug>/api-keys/<uuid:key_id>/",
        APIKeyDetailView.as_view(),
    ),
    # v4.5.0 — Webhooks
    path("workspaces/<slug:workspace_slug>/webhooks/", WebhookListCreateView.as_view()),
    path(
        "workspaces/<slug:workspace_slug>/webhooks/<uuid:hook_id>/",
        WebhookDetailView.as_view(),
    ),
    path(
        "workspaces/<slug:workspace_slug>/webhooks/<uuid:hook_id>/test/",
        WebhookTestView.as_view(),
    ),
    path(
        "workspaces/<slug:workspace_slug>/webhooks/<uuid:hook_id>/deliveries/",
        WebhookDeliveryListView.as_view(),
    ),
]
