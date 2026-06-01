from django.urls import path
from .views import (
    ProjectListCreateView, ProjectDetailView,
    TaskStatusListCreateView,
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
)

_ws = "workspaces/<slug:workspace_slug>"
_pr = f"{_ws}/projects/<uuid:project_id>"
_tk = f"{_pr}/tasks/<uuid:task_id>"

urlpatterns = [
    # Projects
    path(f"{_ws}/projects/",           ProjectListCreateView.as_view()),
    path(f"{_pr}/",                    ProjectDetailView.as_view()),

    # Kanban columns
    path(f"{_pr}/statuses/",           TaskStatusListCreateView.as_view()),

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
]
