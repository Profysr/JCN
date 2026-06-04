from django.urls import path
from .views import (
    ProjectListCreateView, ProjectDetailView,
    UserPresenceView, CommentReactionToggleView,
    ApprovalListCreateView, ApprovalReviewView, ApprovalResubmitView,
    ObjectiveListCreateView, ObjectiveDetailView,
    KeyResultListCreateView, KeyResultDetailView, KeyResultLinkedTasksView,
    TaskStatusListCreateView, TaskStatusDetailView,
    TaskListCreateView, TaskDetailView, TaskMoveView,
    SubTaskListCreateView, SubTaskDetailView,
    TaskCommentListCreateView, TaskCommentDetailView,
    TaskActivityListView,
    LabelListCreateView, LabelDetailView,
    ProjectFieldListCreateView, ProjectFieldDetailView, TaskFieldValueView,
    SavedViewListCreateView, SavedViewDetailView,
    SprintListCreateView, SprintDetailView, SprintBurndownView,
    TaskBulkUpdateView,
    TaskAttachmentListCreateView, TaskAttachmentDeleteView,
    TaskDependencyListCreateView, TaskDependencyDeleteView,
    WorkspaceAnalyticsView,
    TaskExportView,
    ProjectMemberListCreateView, ProjectMemberDetailView,
    GuestTokenListCreateView, GuestTokenDeleteView,
    ProjectPermissionsView,
    BoardListCreateView, BoardDetailView, BoardArchiveView,
    BoardTemplatesView, BoardReorderView,
    # v2.4.0
    TaskCloneView, TaskChildrenView,
    TaskTemplateListCreateView, TaskTemplateDetailView, TaskApplyTemplateView,
    # v2.5.0
    WikiPageListCreateView, WikiPageDetailView, WikiPageRevisionsView,
    DocumentListCreateView, DocumentDetailView,
    # v2.6.0
    FormListCreateView, FormDetailView, FormFieldsBulkUpdateView,
    FormSubmissionListView, PublicFormView, PublicFormSubmitView,
    # v2.7.0
    AutomationRuleListCreateView, AutomationRuleDetailView, AutomationLogListView,
    # v2.8.0
    TimeEntryListCreateView, TimeEntryDeleteView,
    TimerStartView, TimerStopView, TimerActiveView,
    TimesheetView,
    # v2.9.0
    CalendarICSView,
    # v3.2.0
    AdvancedSearchView,
    # v3.3.0
    DashboardListCreateView, DashboardDetailView,
    # v3.4.0
    MyWorkView, PortfolioView,
)

_ws = "workspaces/<slug:workspace_slug>"
_pr = f"{_ws}/projects/<uuid:project_id>"
_tk = f"{_pr}/tasks/<uuid:task_id>"

urlpatterns = [
    # Projects
    path(f"{_ws}/projects/",           ProjectListCreateView.as_view()),
    path(f"{_pr}/",                    ProjectDetailView.as_view()),

    # Kanban columns
    path(f"{_pr}/statuses/",                               TaskStatusListCreateView.as_view()),
    path(f"{_pr}/statuses/<uuid:status_id>/",              TaskStatusDetailView.as_view()),

    # Tasks
    path(f"{_pr}/tasks/",              TaskListCreateView.as_view()),
    path(f"{_pr}/tasks/bulk/",         TaskBulkUpdateView.as_view()),
    path(f"{_pr}/tasks/export/",       TaskExportView.as_view()),
    path(f"{_tk}/",                    TaskDetailView.as_view()),
    path(f"{_tk}/move/",               TaskMoveView.as_view()),

    # Subtasks
    path(f"{_tk}/subtasks/",                                  SubTaskListCreateView.as_view()),
    path(f"{_tk}/subtasks/<uuid:subtask_id>/",                SubTaskDetailView.as_view()),

    # Comments
    path(f"{_tk}/comments/",                                  TaskCommentListCreateView.as_view()),
    path(f"{_tk}/comments/<uuid:comment_id>/",                TaskCommentDetailView.as_view()),

    # Activity log
    path(f"{_tk}/activity/",                                  TaskActivityListView.as_view()),

    # Labels
    path(f"{_pr}/labels/",                                    LabelListCreateView.as_view()),
    path(f"{_pr}/labels/<uuid:label_id>/",                    LabelDetailView.as_view()),

    # Custom fields (v0.8.0)
    path(f"{_pr}/fields/",                                    ProjectFieldListCreateView.as_view()),
    path(f"{_pr}/fields/<uuid:field_id>/",                    ProjectFieldDetailView.as_view()),
    path(f"{_tk}/field-values/",                              TaskFieldValueView.as_view()),

    # Saved views (v0.8.0)
    path(f"{_pr}/saved-views/",                               SavedViewListCreateView.as_view()),
    path(f"{_pr}/saved-views/<uuid:view_id>/",                SavedViewDetailView.as_view()),

    # Sprints (v0.9.0)
    path(f"{_pr}/sprints/",                                   SprintListCreateView.as_view()),
    path(f"{_pr}/sprints/<uuid:sprint_id>/",                  SprintDetailView.as_view()),
    path(f"{_pr}/sprints/<uuid:sprint_id>/burndown/",         SprintBurndownView.as_view()),

    # Attachments (v1.2.0)
    path(f"{_tk}/attachments/",                               TaskAttachmentListCreateView.as_view()),
    path(f"{_tk}/attachments/<uuid:attachment_id>/",          TaskAttachmentDeleteView.as_view()),

    # Dependencies (v1.4.0)
    path(f"{_tk}/dependencies/",                              TaskDependencyListCreateView.as_view()),
    path(f"{_tk}/dependencies/<uuid:dep_id>/",                TaskDependencyDeleteView.as_view()),

    # Analytics (v1.5.0)
    path(f"{_ws}/analytics/",                                 WorkspaceAnalyticsView.as_view()),

    # Project Members & Permissions (v2.1.0)
    path(f"{_pr}/members/",                                   ProjectMemberListCreateView.as_view()),
    path(f"{_pr}/members/<uuid:member_id>/",                  ProjectMemberDetailView.as_view()),
    path(f"{_pr}/guest-tokens/",                              GuestTokenListCreateView.as_view()),
    path(f"{_pr}/guest-tokens/<uuid:token_id>/",              GuestTokenDeleteView.as_view()),
    path(f"{_pr}/my-permissions/",                            ProjectPermissionsView.as_view()),

]

# Boards (v2.2.0)
_bd = f"{_pr}/boards"
urlpatterns += [
    path(f"{_bd}/",                                           BoardListCreateView.as_view()),
    path(f"{_bd}/reorder/",                                   BoardReorderView.as_view()),
    path(f"{_bd}/templates/",                                 BoardTemplatesView.as_view()),
    path(f"{_bd}/<uuid:board_id>/",                           BoardDetailView.as_view()),
    path(f"{_bd}/<uuid:board_id>/archive/",                   BoardArchiveView.as_view()),
]

# v2.4.0 — Advanced Task System
urlpatterns += [
    path(f"{_tk}/clone/",                                     TaskCloneView.as_view()),
    path(f"{_tk}/children/",                                  TaskChildrenView.as_view()),
    path(f"{_tk}/apply-template/",                            TaskApplyTemplateView.as_view()),
    path(f"{_pr}/task-templates/",                            TaskTemplateListCreateView.as_view()),
    path(f"{_pr}/task-templates/<uuid:template_id>/",         TaskTemplateDetailView.as_view()),
]

# v2.5.0 — Wiki & Documents
urlpatterns += [
    path(f"{_pr}/wiki/",                                      WikiPageListCreateView.as_view()),
    path(f"{_pr}/wiki/<uuid:page_id>/",                       WikiPageDetailView.as_view()),
    path(f"{_pr}/wiki/<uuid:page_id>/revisions/",             WikiPageRevisionsView.as_view()),
    path(f"{_ws}/documents/",                                 DocumentListCreateView.as_view()),
    path(f"{_ws}/documents/<uuid:doc_id>/",                   DocumentDetailView.as_view()),
]

# v2.6.0 — Forms & Intake
urlpatterns += [
    path(f"{_pr}/forms/",                                     FormListCreateView.as_view()),
    path(f"{_pr}/forms/<uuid:form_id>/",                      FormDetailView.as_view()),
    path(f"{_pr}/forms/<uuid:form_id>/fields/",               FormFieldsBulkUpdateView.as_view()),
    path(f"{_pr}/forms/<uuid:form_id>/submissions/",          FormSubmissionListView.as_view()),
]

# Public form endpoints — already under api/ via core/urls.py include, so no api/ prefix here
urlpatterns += [
    path("forms/<uuid:form_token>/",         PublicFormView.as_view()),
    path("forms/<uuid:form_token>/submit/",  PublicFormSubmitView.as_view()),
]

# v2.7.0 — Automation Engine
urlpatterns += [
    path(f"{_pr}/automations/",                                 AutomationRuleListCreateView.as_view()),
    path(f"{_pr}/automations/<uuid:rule_id>/",                  AutomationRuleDetailView.as_view()),
    path(f"{_pr}/automations/<uuid:rule_id>/logs/",             AutomationLogListView.as_view()),
]

# v2.8.0 — Time Tracking
urlpatterns += [
    path(f"{_tk}/time-entries/",                                TimeEntryListCreateView.as_view()),
    path(f"{_tk}/time-entries/<uuid:entry_id>/",                TimeEntryDeleteView.as_view()),
    path(f"{_tk}/timer/start/",                                 TimerStartView.as_view()),
    path(f"{_ws}/timer/stop/",                                  TimerStopView.as_view()),
    path(f"{_ws}/timer/active/",                                TimerActiveView.as_view()),
    path(f"{_ws}/timesheets/",                                  TimesheetView.as_view()),
]

# v2.9.0 — Calendar
urlpatterns += [
    path(f"{_pr}/calendar.ics/",                                CalendarICSView.as_view()),
]

# v3.2.0 — Advanced Search
urlpatterns += [
    path("search/advanced/",                                     AdvancedSearchView.as_view()),
]

# v3.3.0 — Custom Dashboards
urlpatterns += [
    path(f"{_ws}/dashboards/",                                   DashboardListCreateView.as_view()),
    path(f"{_ws}/dashboards/<uuid:dashboard_id>/",               DashboardDetailView.as_view()),
]

# v3.4.0 — My Work + Portfolio
urlpatterns += [
    path("my-work/",                                             MyWorkView.as_view()),
    path(f"{_ws}/portfolio/",                                    PortfolioView.as_view()),
]

# v3.5.0 — Real-Time Collaboration v2
urlpatterns += [
    path(f"{_ws}/presence/",                                     UserPresenceView.as_view()),
    path(f"{_tk}/comments/<uuid:comment_id>/reactions/",         CommentReactionToggleView.as_view()),
]

# v3.6.0 — Approval Workflows
urlpatterns += [
    path(f"{_tk}/approvals/",                                    ApprovalListCreateView.as_view()),
    path(f"{_tk}/approvals/<uuid:approval_id>/review/",          ApprovalReviewView.as_view()),
    path(f"{_tk}/approvals/<uuid:approval_id>/resubmit/",        ApprovalResubmitView.as_view()),
]

# v3.8.0 — OKR & Goal Tracking
_ob = "workspaces/<slug:workspace_slug>/objectives"
urlpatterns += [
    path(f"{_ob}/",                                                        ObjectiveListCreateView.as_view()),
    path(f"{_ob}/<uuid:obj_id>/",                                          ObjectiveDetailView.as_view()),
    path(f"{_ob}/<uuid:obj_id>/key-results/",                              KeyResultListCreateView.as_view()),
    path(f"{_ob}/<uuid:obj_id>/key-results/<uuid:kr_id>/",                 KeyResultDetailView.as_view()),
    path(f"{_ob}/<uuid:obj_id>/key-results/<uuid:kr_id>/tasks/",           KeyResultLinkedTasksView.as_view()),
]
