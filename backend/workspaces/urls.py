from django.urls import path
from .views import (
    WorkspaceModuleListView,
    WorkspaceModuleToggleView,
    WorkspaceListCreateView,
    WorkspaceDetailView,
    WorkspaceMemberListView,
    WorkspaceMemberDetailView,
    InviteMemberView,
    WorkspaceInviteListView,
    WorkspaceInviteCancelView,
    InviteDetailView,
    AcceptInviteView,
    OnboardingStateView,
    InboxListView,
    InboxItemUpdateView,
    InboxBulkUpdateView,
    InboxUnreadCountView,
    # v4.5.0
    APIKeyListCreateView,
    APIKeyDetailView,
    WebhookListCreateView,
    WebhookDetailView,
    WebhookTestView,
    WebhookDeliveryListView,
    # v4.6.0
    ImportSourcesView,
    ImportJobListCreateView,
    ImportJobDetailView,
    ImportJobRunView,
    ImportJobRollbackView,
    # vD.1 — Custom RBAC
    WorkspacePermissionsView,
    CustomRoleListCreateView,
    CustomRoleDetailView,
    MemberAssignRoleView,
    MemberBulkAssignRoleView,
)

# Workspace is identified by its stable UUIDv7 ID (wsp_...)
_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Workspaces
    path("workspaces/", WorkspaceListCreateView.as_view()),
    path(f"{_ws}/", WorkspaceDetailView.as_view()),

    # Members
    path(f"{_ws}/members/", WorkspaceMemberListView.as_view()),
    path(f"{_ws}/members/<str:member_id>/", WorkspaceMemberDetailView.as_view()),

    # Invites — token stays <uuid:> because it's an opaque UUID4 secret, not a prefixed ID
    path(f"{_ws}/invites/", InviteMemberView.as_view()),
    path(f"{_ws}/invites/pending/", WorkspaceInviteListView.as_view()),
    path(f"{_ws}/invites/<uuid:token>/", WorkspaceInviteCancelView.as_view()),

    # Public invite accept flow
    path("invites/<uuid:token>/", InviteDetailView.as_view()),
    path("invites/<uuid:token>/accept/", AcceptInviteView.as_view()),

    # Onboarding (v2.3.0)
    path(f"{_ws}/onboarding/", OnboardingStateView.as_view()),

    # Inbox (v3.7.0)
    path("inbox/", InboxListView.as_view()),
    path("inbox/bulk/", InboxBulkUpdateView.as_view()),
    path("inbox/unread-count/", InboxUnreadCountView.as_view()),
    path("inbox/<str:item_id>/", InboxItemUpdateView.as_view()),

    # API Keys (v4.5.0)
    path(f"{_ws}/api-keys/", APIKeyListCreateView.as_view()),
    path(f"{_ws}/api-keys/<str:key_id>/", APIKeyDetailView.as_view()),

    # Webhooks (v4.5.0)
    path(f"{_ws}/webhooks/", WebhookListCreateView.as_view()),
    path(f"{_ws}/webhooks/<str:hook_id>/", WebhookDetailView.as_view()),
    path(f"{_ws}/webhooks/<str:hook_id>/test/", WebhookTestView.as_view()),
    path(f"{_ws}/webhooks/<str:hook_id>/deliveries/", WebhookDeliveryListView.as_view()),

    # Import & Migration Tools (v4.6.0)
    path(f"{_ws}/import/sources/", ImportSourcesView.as_view()),
    path(f"{_ws}/import/jobs/", ImportJobListCreateView.as_view()),
    path(f"{_ws}/import/jobs/<str:job_id>/", ImportJobDetailView.as_view()),
    path(f"{_ws}/import/jobs/<str:job_id>/run/", ImportJobRunView.as_view()),
    path(f"{_ws}/import/jobs/<str:job_id>/rollback/", ImportJobRollbackView.as_view()),

    # Module System
    path(f"{_ws}/modules/", WorkspaceModuleListView.as_view()),
    path(f"{_ws}/modules/<str:module_key>/", WorkspaceModuleToggleView.as_view()),

    # Custom RBAC (vD.1)
    path(f"{_ws}/permissions/", WorkspacePermissionsView.as_view()),
    path(f"{_ws}/roles/", CustomRoleListCreateView.as_view()),
    path(f"{_ws}/roles/<str:role_id>/", CustomRoleDetailView.as_view()),
    path(f"{_ws}/members/bulk-assign-role/", MemberBulkAssignRoleView.as_view()),
    path(f"{_ws}/members/<str:member_id>/assign-role/", MemberAssignRoleView.as_view()),
]
