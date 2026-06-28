from django.urls import path
from .views import (
    AnalyticsAggregateView,
    TaskDrilldownView,
    TeamWorkloadView,
    WorkspaceSummaryView,
)

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    path(f"{_ws}/analytics/summary/", WorkspaceSummaryView.as_view()),
    path(f"{_ws}/analytics/team/", TeamWorkloadView.as_view()),
    path(f"{_ws}/analytics/tasks/", TaskDrilldownView.as_view()),
    path(f"{_ws}/analytics/aggregate/", AnalyticsAggregateView.as_view()),
]
