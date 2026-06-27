from django.urls import path
from .views import AnalyticsMetricView, WorkloadHeatmapView

_ws = "workspaces/<str:workspace_id>"

urlpatterns = [
    # Dedicated paginated view (cursor-based, members × days)
    path(f"{_ws}/analytics/workload-heatmap/", WorkloadHeatmapView.as_view()),
    # Single dynamic endpoint for all other metrics
    path(f"{_ws}/analytics/<str:metric>/", AnalyticsMetricView.as_view()),
]
