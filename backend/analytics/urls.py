from django.urls import path
from .views import (
    AnalyticsMetricView,
    ReportListCreateView,
    ReportDetailView,
    ReportDataView,
)

_ws = "workspaces/<slug:workspace_slug>"
_rp = f"{_ws}/reports"

urlpatterns = [
    # Single dynamic endpoint — metric is one of: overview, velocity, cycle_time,
    # lead_time, throughput, cfd, burnup, workload_heatmap
    path(f"{_ws}/analytics/<str:metric>/", AnalyticsMetricView.as_view()),

    # Report builder CRUD + data execution
    path(f"{_rp}/",                        ReportListCreateView.as_view()),
    path(f"{_rp}/<uuid:report_id>/",       ReportDetailView.as_view()),
    path(f"{_rp}/<uuid:report_id>/data/",  ReportDataView.as_view()),
]
