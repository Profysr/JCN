from django.urls import path
from .views import (
    BoardListCreateView,
    BoardDetailView,
    BoardMemberListCreateView,
    BoardMemberDetailView,
    ProjectPermissionsView,
    UserPresenceView,
    CommentReactionToggleView,
    ApprovalListCreateView,
    ApprovalReviewView,
    ApprovalResubmitView,
    ObjectiveListCreateView,
    ObjectiveDetailView,
    KeyResultListCreateView,
    KeyResultDetailView,
    KeyResultLinkedTasksView,
    TaskStatusListCreateView,
    TaskStatusDetailView,
    TaskStatusReorderView,
    TaskListCreateView,
    TaskDetailView,
    TaskMoveView,
    SubTaskListCreateView,
    SubTaskDetailView,
    TaskCommentListCreateView,
    TaskCommentDetailView,
    TaskActivityListView,
    LabelListCreateView,
    LabelDetailView,
    BoardFieldListCreateView,
    BoardFieldDetailView,
    TaskFieldValueView,
    SavedViewListCreateView,
    SavedViewDetailView,
    SprintListCreateView,
    SprintDetailView,
    SprintBurndownView,
    TaskBulkUpdateView,
    TaskAttachmentListCreateView,
    TaskAttachmentDeleteView,
    TaskDependencyListCreateView,
    TaskDependencyDeleteView,
    TaskExportView,
    # v2.4.0
    TaskCloneView,
    TaskChildrenView,
    TaskTemplateListCreateView,
    TaskTemplateDetailView,
    TaskApplyTemplateView,
    # v2.5.0
    WikiPageListCreateView,
    WikiPageDetailView,
    WikiPageRevisionsView,
    DocumentListCreateView,
    DocumentDetailView,
    # v2.6.0
    FormListCreateView,
    FormDetailView,
    FormFieldsBulkUpdateView,
    FormSubmissionListView,
    PublicFormView,
    PublicFormSubmitView,
    # v2.7.0
    AutomationRuleListCreateView,
    AutomationRuleDetailView,
    AutomationLogListView,
    # v3.4.0
    MyWorkView,
    PortfolioView,
    GlobalSearchView,
)

_ws = "workspaces/<str:workspace_id>"
_pr = f"{_ws}/boards/<str:project_id>"
_tk = f"{_pr}/tasks/<str:task_id>"

urlpatterns = [
    # Boards
    path(f"{_ws}/boards/", BoardListCreateView.as_view()),
    path(f"{_pr}/", BoardDetailView.as_view()),
    # Board members & permissions
    path(f"{_pr}/members/", BoardMemberListCreateView.as_view()),
    path(f"{_pr}/members/<str:member_id>/", BoardMemberDetailView.as_view()),
    path(f"{_pr}/my-permissions/", ProjectPermissionsView.as_view()),
    # Kanban columns
    path(f"{_pr}/statuses/", TaskStatusListCreateView.as_view()),
    path(f"{_pr}/statuses/reorder/", TaskStatusReorderView.as_view()),
    path(f"{_pr}/statuses/<str:status_id>/", TaskStatusDetailView.as_view()),
    # Tasks
    path(f"{_pr}/tasks/", TaskListCreateView.as_view()),
    path(f"{_pr}/tasks/bulk/", TaskBulkUpdateView.as_view()),
    path(f"{_pr}/tasks/export/", TaskExportView.as_view()),
    path(f"{_tk}/", TaskDetailView.as_view()),
    path(f"{_tk}/move/", TaskMoveView.as_view()),
    # Subtasks
    path(f"{_tk}/subtasks/", SubTaskListCreateView.as_view()),
    path(f"{_tk}/subtasks/<str:subtask_id>/", SubTaskDetailView.as_view()),
    # Comments
    path(f"{_tk}/comments/", TaskCommentListCreateView.as_view()),
    path(f"{_tk}/comments/<str:comment_id>/", TaskCommentDetailView.as_view()),
    path(f"{_tk}/comments/<str:comment_id>/reactions/", CommentReactionToggleView.as_view()),
    # Activity log
    path(f"{_tk}/activity/", TaskActivityListView.as_view()),
    # Labels
    path(f"{_pr}/labels/", LabelListCreateView.as_view()),
    path(f"{_pr}/labels/<str:label_id>/", LabelDetailView.as_view()),
    # Custom fields
    path(f"{_pr}/fields/", BoardFieldListCreateView.as_view()),
    path(f"{_pr}/fields/<str:field_id>/", BoardFieldDetailView.as_view()),
    path(f"{_tk}/field-values/", TaskFieldValueView.as_view()),
    # Saved views
    path(f"{_pr}/saved-views/", SavedViewListCreateView.as_view()),
    path(f"{_pr}/saved-views/<str:view_id>/", SavedViewDetailView.as_view()),
    # Sprints
    path(f"{_pr}/sprints/", SprintListCreateView.as_view()),
    path(f"{_pr}/sprints/<str:sprint_id>/", SprintDetailView.as_view()),
    path(f"{_pr}/sprints/<str:sprint_id>/burndown/", SprintBurndownView.as_view()),
    # Attachments
    path(f"{_tk}/attachments/", TaskAttachmentListCreateView.as_view()),
    path(f"{_tk}/attachments/<str:attachment_id>/", TaskAttachmentDeleteView.as_view()),
    # Dependencies
    path(f"{_tk}/dependencies/", TaskDependencyListCreateView.as_view()),
    path(f"{_tk}/dependencies/<str:dep_id>/", TaskDependencyDeleteView.as_view()),
    # v2.4.0 — Advanced Task System
    path(f"{_tk}/clone/", TaskCloneView.as_view()),
    path(f"{_tk}/children/", TaskChildrenView.as_view()),
    path(f"{_tk}/apply-template/", TaskApplyTemplateView.as_view()),
    path(f"{_pr}/task-templates/", TaskTemplateListCreateView.as_view()),
    path(f"{_pr}/task-templates/<str:template_id>/", TaskTemplateDetailView.as_view()),
    # v2.5.0 — Wiki & Documents
    path(f"{_pr}/wiki/", WikiPageListCreateView.as_view()),
    path(f"{_pr}/wiki/<str:page_id>/", WikiPageDetailView.as_view()),
    path(f"{_pr}/wiki/<str:page_id>/revisions/", WikiPageRevisionsView.as_view()),
    path(f"{_ws}/documents/", DocumentListCreateView.as_view()),
    path(f"{_ws}/documents/<str:doc_id>/", DocumentDetailView.as_view()),
    # v2.6.0 — Forms & Intake
    path(f"{_pr}/forms/", FormListCreateView.as_view()),
    path(f"{_pr}/forms/<str:form_id>/", FormDetailView.as_view()),
    path(f"{_pr}/forms/<str:form_id>/fields/", FormFieldsBulkUpdateView.as_view()),
    path(f"{_pr}/forms/<str:form_id>/submissions/", FormSubmissionListView.as_view()),
    # Public form endpoints
    path("forms/<str:form_token>/", PublicFormView.as_view()),
    path("forms/<str:form_token>/submit/", PublicFormSubmitView.as_view()),
    # v2.7.0 — Automation Engine
    path(f"{_pr}/automations/", AutomationRuleListCreateView.as_view()),
    path(f"{_pr}/automations/<str:rule_id>/", AutomationRuleDetailView.as_view()),
    path(f"{_pr}/automations/<str:rule_id>/logs/", AutomationLogListView.as_view()),
    path("search/", GlobalSearchView.as_view()),
    # v3.4.0 — My Work + Portfolio
    path("my-work/", MyWorkView.as_view()),
    path(f"{_ws}/portfolio/", PortfolioView.as_view()),
    # v3.5.0 — Real-Time Collaboration
    path(f"{_ws}/presence/", UserPresenceView.as_view()),
    # v3.6.0 — Approval Workflows
    path(f"{_tk}/approvals/", ApprovalListCreateView.as_view()),
    path(f"{_tk}/approvals/<str:approval_id>/review/", ApprovalReviewView.as_view()),
    path(f"{_tk}/approvals/<str:approval_id>/resubmit/", ApprovalResubmitView.as_view()),
]

_ob = "workspaces/<str:workspace_id>/objectives"
urlpatterns += [
    path(f"{_ob}/", ObjectiveListCreateView.as_view()),
    path(f"{_ob}/<str:obj_id>/", ObjectiveDetailView.as_view()),
    path(f"{_ob}/<str:obj_id>/key-results/", KeyResultListCreateView.as_view()),
    path(f"{_ob}/<str:obj_id>/key-results/<str:kr_id>/", KeyResultDetailView.as_view()),
    path(f"{_ob}/<str:obj_id>/key-results/<str:kr_id>/tasks/", KeyResultLinkedTasksView.as_view()),
]
