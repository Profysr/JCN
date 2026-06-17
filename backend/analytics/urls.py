from django.urls import path
from .views import AnalyticsMetricView

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Single dynamic endpoint for all metrics.
    # metric is one of: overview, velocity, cycle_time, lead_time, throughput,
    # cfd, burnup, workload_heatmap, time_in_status, overdue_aging,
    # completion_rate, estimation_accuracy, sprint_burndown
    path(f"{_ws}/analytics/<str:metric>/", AnalyticsMetricView.as_view()),
]
