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


class OrgListPagination(PageNumberPagination):
    """Page-based pagination for org structure list endpoints (departments, teams, reporting lines)."""
    page_size = 50
    page_size_query_param = "size"
    max_page_size = 100


class TaskDrilldownPagination(CursorPagination):
    """
    Keyset (cursor) pagination for the analytics task drill-down.

    Tickets are the only unbounded-cardinality axis in analytics, so the
    drill-down paginates by ticket — and uses cursor (not offset) pagination so
    deep scrolling stays O(page_size) and is stable under concurrent inserts.
    Default ordering is `-id`; because PKs are UUIDv7 (time-sortable) this yields
    newest-first for free. The view overrides `ordering` per `?order=` value.
    """
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100
    ordering = ("-id",)
