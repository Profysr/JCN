from django.urls import path
from .views import (
    AnalyticsMetricView,
    TaskDrilldownView,
    TeamWorkloadView,
    WorkspaceSummaryView,
)

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Dedicated views (must precede the generic <metric> catch-all)
    path(f"{_ws}/analytics/summary/", WorkspaceSummaryView.as_view()),
    path(f"{_ws}/analytics/team/", TeamWorkloadView.as_view()),
    path(f"{_ws}/analytics/tasks/", TaskDrilldownView.as_view()),
    # Single dynamic endpoint for all remaining metrics
    path(f"{_ws}/analytics/<str:metric>/", AnalyticsMetricView.as_view()),
]
