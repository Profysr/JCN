from rest_framework.pagination import CursorPagination, PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "size"
    max_page_size = 100


class CommentPagination(CursorPagination):
    page_size = 20
    page_size_query_param = "size"
    max_page_size = 50
    ordering = "-id"


class ActivityPagination(CursorPagination):
    page_size = 32
    page_size_query_param = "size"
    max_page_size = 100
    ordering = "-id"


class HeatmapPagination(CursorPagination):
    """Cursor pagination for the workload heatmap — pages through members alphabetically."""
    page_size = 10
    page_size_query_param = "size"
    max_page_size = 50
    ordering = ("full_name", "id")


class AnalyticsPagination(PageNumberPagination):
    """Page-based pagination for analytics list endpoints (overdue tasks, etc.)."""
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
