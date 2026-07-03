import datetime
import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from core.pagination import HeatmapPagination, TaskDrilldownPagination
from .serializers import TaskDrilldownSerializer, TeamMemberSerializer
from projects.models import Sprint, Task
from workspaces import access

logger = logging.getLogger(__name__)

_MAX_DAYS = 365


def _parse_days(params, default=30):
    try:
        return min(max(1, int(params.get("days", default))), _MAX_DAYS)
    except (ValueError, TypeError):
        return default


# ==============================================================================
# ── AGGREGATE ENDPOINT CONFIG ─────────────────────────────────────────────────
# ==============================================================================

_AGG_PAGE_SIZE_MAX = 50
_AGG_PAGE_SIZE_DEFAULT = 25

# "sprint" disabled — sprint analytics are not yet built.
_VALID_GROUP_BY = {"assignee", "status", "priority", "type", "board", "date"}
_VALID_METRIC = {"count", "story_points"}

_GROUP_CONFIG = {
    "assignee": {
        "values": ["assignee_id", "assignee__full_name", "assignee__email"],
        "key": "assignee_id",
        "label": lambda r: r.get("assignee__full_name")
        or (r.get("assignee__email") or "").split("@")[0]
        or "Unassigned",
    },
    "status": {
        "values": ["status_id", "status__name", "status__color"],
        "key": "status_id",
        "label": lambda r: r.get("status__name") or "No Status",
        "extra": lambda r: {"color": r.get("status__color")},
    },
    "priority": {
        "values": ["priority"],
        "key": "priority",
        "label": lambda r: (r.get("priority") or "no_priority")
        .replace("_", " ")
        .title(),
    },
    "type": {
        "values": ["task_type"],
        "key": "task_type",
        "label": lambda r: (r.get("task_type") or "task").replace("_", " ").title(),
    },
    "board": {
        "values": ["board_id", "board__name"],
        "key": "board_id",
        "label": lambda r: r.get("board__name") or "Unknown Board",
    },
    # "sprint" removed from _VALID_GROUP_BY — uncomment to re-enable:
    # "sprint": {
    #     "values": ["sprint_id", "sprint__name"],
    #     "key": "sprint_id",
    #     "label": lambda r: r.get("sprint__name") or "No Sprint",
    # },
    "date": {
        "values": [],
        "key": "day",
        "label": lambda r: str(r.get("day", "")),
    },
}


def _parse_date_param(value):
    """Convert '14d' (relative) or an ISO date/datetime string to a tz-aware datetime."""
    if not value:
        return None
    if isinstance(value, str) and value.endswith("d"):
        try:
            return timezone.now() - datetime.timedelta(days=int(value[:-1]))
        except (ValueError, TypeError):
            return None
    try:
        import datetime as dt_mod

        return dt_mod.datetime.fromisoformat(value).replace(tzinfo=dt_mod.timezone.utc)
    except (ValueError, TypeError):
        return None


def _apply_task_filters(qs, params, workspace):
    """
    Shared filter set applied identically across all four analytics views.

    All params are flat (no bracket notation), optional, and AND-combined.
    Multi-value params accept comma-separated strings.

    board=uuid
    status=id1,id2
    priority=high,medium
    type=bug,task
    assignee=id1,id2
    label=id1,id2
    due=overdue,today,this_week,no_date     (OR within dimension)
    sprint=current|last|uuid
    blocked=true|false
    open=true|false
    overdue=true
    created_before=14d|ISO-datetime
    created_after=30d|ISO-datetime
    due_before=YYYY-MM-DD
    due_after=YYYY-MM-DD
    search=text
    """
    board_id = params.get("board")
    if board_id:
        qs = qs.filter(board_id=board_id)

    if params.get("status"):
        ids = [s for s in params["status"].split(",") if s.strip()]
        if ids:
            qs = qs.filter(status_id__in=ids)

    if params.get("priority"):
        qs = qs.filter(
            priority__in=[p.strip() for p in params["priority"].split(",") if p.strip()]
        )

    if params.get("type"):
        qs = qs.filter(
            task_type__in=[t.strip() for t in params["type"].split(",") if t.strip()]
        )

    if params.get("assignee"):
        ids = [a for a in params["assignee"].split(",") if a.strip()]
        if ids:
            qs = qs.filter(assignee_id__in=ids)

    if params.get("label"):
        ids = [l for l in params["label"].split(",") if l.strip()]
        if ids:
            qs = qs.filter(labels__id__in=ids).distinct()

    # Due-date chips — OR within the dimension, mirrors the Kanban filter bar.
    due_tokens = [t.strip() for t in (params.get("due") or "").split(",") if t.strip()]
    if due_tokens:
        today = datetime.date.today()
        week_end = today + datetime.timedelta(days=7)
        due_q = Q()
        for tok in due_tokens:
            if tok == "overdue":
                due_q |= Q(
                    due_date__isnull=False, due_date__lt=today, status__is_done=False
                )
            elif tok == "today":
                due_q |= Q(due_date=today)
            elif tok == "this_week":
                due_q |= Q(due_date__gte=today, due_date__lte=week_end)
            elif tok == "no_date":
                due_q |= Q(due_date__isnull=True)
        if due_q:
            qs = qs.filter(due_q)

    f_sprint = params.get("sprint")
    if f_sprint:
        if f_sprint == "current":
            qs = qs.filter(sprint__status=Sprint.Status.ACTIVE)
        elif f_sprint == "last":
            last = (
                Sprint.objects.filter(
                    board__workspace=workspace, status=Sprint.Status.COMPLETED
                )
                .order_by("-end_date")
                .values("id")
                .first()
            )
            qs = qs.filter(sprint_id=last["id"]) if last else qs.none()
        else:
            qs = qs.filter(sprint_id=f_sprint)

    f_blocked = (params.get("blocked") or "").lower()
    if f_blocked == "true":
        qs = qs.filter(blocked_by_deps__isnull=False).distinct()
    elif f_blocked == "false":
        qs = qs.filter(blocked_by_deps__isnull=True)

    f_open = (params.get("open") or "").lower()
    if f_open == "true":
        qs = qs.filter(status__is_done=False)
    elif f_open == "false":
        qs = qs.filter(status__is_done=True)

    if (params.get("overdue") or "").lower() == "true":
        qs = qs.filter(
            due_date__isnull=False,
            due_date__lt=datetime.date.today(),
            status__is_done=False,
        )

    dt_before = _parse_date_param(params.get("created_before"))
    if dt_before:
        qs = qs.filter(created_at__lte=dt_before)

    dt_after = _parse_date_param(params.get("created_after"))
    if dt_after:
        qs = qs.filter(created_at__gte=dt_after)

    if params.get("due_before"):
        try:
            qs = qs.filter(
                due_date__lte=datetime.date.fromisoformat(params["due_before"])
            )
        except (ValueError, TypeError):
            pass

    if params.get("due_after"):
        try:
            qs = qs.filter(
                due_date__gte=datetime.date.fromisoformat(params["due_after"])
            )
        except (ValueError, TypeError):
            pass

    search = (params.get("search") or "").strip()
    if search:
        qs = qs.filter(title__icontains=search)

    return qs


def _run_group(qs, group_by, agg_metric, page, page_size):
    """Run one independent group-by aggregation on a pre-filtered queryset."""
    cfg = _GROUP_CONFIG[group_by]

    if group_by == "date":
        agg_qs = qs.annotate(day=TruncDate("created_at")).values("day")
    else:
        agg_qs = qs.values(*cfg["values"])

    if agg_metric == "story_points":
        agg_qs = agg_qs.annotate(value=Sum("estimate_points")).order_by("-value")
    else:
        agg_qs = agg_qs.annotate(value=Count("id")).order_by("-value")

    all_rows = list(agg_qs)
    total_groups = len(all_rows)
    offset = (page - 1) * page_size
    page_rows = all_rows[offset : offset + page_size]

    label_fn = cfg["label"]
    extra_fn = cfg.get("extra")
    key_field = cfg["key"]

    results = []
    for r in page_rows:
        item = {
            "key": str(r.get(key_field) or ""),
            "label": label_fn(r),
            "value": r.get("value") or 0,
        }
        if extra_fn:
            item.update(extra_fn(r))
        results.append(item)

    return {
        "total_groups": total_groups,
        "page": page,
        "page_size": page_size,
        "has_more": (offset + page_size) < total_groups,
        "results": results,
    }


# ==============================================================================
# ── VIEWS ─────────────────────────────────────────────────────────────────────
# ==============================================================================


class AnalyticsAggregateView(APIView):
    """Universal group-by aggregate — one request powers all board-level charts.

    Accepts multiple dimensions in one call and returns a rich `summary` block
    alongside per-dimension `groups`, all computed on the same filtered queryset.

    Request params:
      group_by    Comma-separated dims: assignee|status|priority|type|board|date
                  e.g. group_by=status,priority,type,assignee
      metric      count (default) | story_points
      stale_days  Threshold for the stale count in summary (default 30)
      page        Page per dimension (default 1)
      page_size   Rows per page per dimension (default 25, max 50)
      + all shared filter params (see _apply_task_filters docstring)

    Response:
      {
        "summary": {
          "total": 120, "open": 45, "done": 75,
          "overdue": 12, "blocked": 8, "stale": 20
        },
        "group_by": ["status", "priority"],
        "metric": "count",
        "groups": {
          "status":   { "results": [...], "total_groups": 5, "page": 1, "page_size": 25, "has_more": false },
          "priority": { "results": [...], ... }
        }
      }
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = access.authorize(
            request, workspace_id, perm="pm.view_analytics", scope="read"
        )
        params = request.query_params

        # ── group_by ──────────────────────────────────────────────────────────
        raw = params.get("group_by", "status")
        seen: set = set()
        group_by_list = [
            g
            for token in raw.split(",")
            if (g := token.strip()) in _VALID_GROUP_BY
            and g not in seen
            and not seen.add(g)
        ]
        if not group_by_list:
            group_by_list = ["status"]

        # ── metric & pagination ────────────────────────────────────────────────
        agg_metric = params.get("metric", "count")
        if agg_metric not in _VALID_METRIC:
            agg_metric = "count"

        try:
            page = max(1, int(params.get("page", 1)))
        except (ValueError, TypeError):
            page = 1
        try:
            page_size = min(
                _AGG_PAGE_SIZE_MAX,
                max(1, int(params.get("page_size", _AGG_PAGE_SIZE_DEFAULT))),
            )
        except (ValueError, TypeError):
            page_size = _AGG_PAGE_SIZE_DEFAULT

        # ── shared queryset — filters applied once for all calculations ────────
        base_qs = _apply_task_filters(
            Task.objects.filter(board__workspace=workspace), params, workspace
        )

        # ── rich summary — headline counts in 2 queries ────────────────────────
        today = datetime.date.today()
        try:
            stale_days = min(max(1, int(params.get("stale_days", 30))), _MAX_DAYS)
        except (ValueError, TypeError):
            stale_days = 30
        stale_cutoff = timezone.now() - datetime.timedelta(days=stale_days)

        summary = base_qs.aggregate(
            total=Count("id"),
            open=Count("id", filter=Q(status__is_done=False)),
            done=Count("id", filter=Q(status__is_done=True)),
            overdue=Count(
                "id",
                filter=Q(
                    status__is_done=False,
                    due_date__isnull=False,
                    due_date__lt=today,
                ),
            ),
            stale=Count(
                "id",
                filter=Q(
                    status__is_done=False,
                    created_at__lte=stale_cutoff,
                ),
            ),
        )
        # blocked_by_deps is M2M — requires a separate distinct() count
        summary["blocked"] = (
            base_qs.filter(blocked_by_deps__isnull=False).distinct().count()
        )

        # ── per-dimension group aggregations (1 DB query per dim) ─────────────
        groups = {
            g: _run_group(base_qs, g, agg_metric, page, page_size)
            for g in group_by_list
        }

        return Response(
            {
                "group_by": group_by_list,
                "metric": agg_metric,
                "summary": summary,
                "groups": groups,
            }
        )


class WorkspaceSummaryView(APIView):
    """Headline KPI counts for the top-of-page cards — total / open / done / overdue.

    Fast single aggregate() call. Respects the same shared filter params
    (board, priority, assignee, …) as all other analytics views.
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = access.authorize(
            request, workspace_id, perm="pm.view_analytics", scope="read"
        )
        today = datetime.date.today()
        qs = _apply_task_filters(
            Task.objects.filter(board__workspace=workspace),
            request.query_params,
            workspace,
        )
        agg = qs.aggregate(
            total=Count("id"),
            open=Count("id", filter=Q(status__is_done=False)),
            done=Count("id", filter=Q(status__is_done=True)),
            overdue=Count(
                "id",
                filter=Q(
                    status__is_done=False,
                    due_date__isnull=False,
                    due_date__lt=today,
                ),
            ),
        )
        return Response(agg)


class TeamWorkloadView(APIView):
    """Per-member workload rollup — assigned / open / overdue / done / story points
    plus a per-day due-date heatmap — one row per workspace member.

    Cursor-paginated by user (full_name, id). Accepts all shared filter params
    (board, priority, assignee, …) plus:
      days=N   Heatmap window width in days (default 14)
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]
    pagination_class = HeatmapPagination  # cursor by (full_name, id)

    def get(self, request, workspace_id):
        User = get_user_model()
        workspace = access.authorize(
            request, workspace_id, perm="pm.view_analytics", scope="read"
        )
        params = request.query_params
        days = _parse_days(params, 14)
        today = datetime.date.today()
        start_date = today - datetime.timedelta(days=days - 1)
        date_strs = [
            (start_date + datetime.timedelta(days=i)).isoformat() for i in range(days)
        ]

        base = _apply_task_filters(
            Task.objects.filter(board__workspace=workspace, assignee__isnull=False),
            params,
            workspace,
        )

        member_ids = base.values_list("assignee_id", flat=True).distinct()
        member_qs = (
            User.objects.filter(id__in=member_ids)
            .only("id", "full_name", "email", "avatar", "avatar_type", "avatar_icon")
            .order_by("full_name", "id")  # must match HeatmapPagination.ordering
        )

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(member_qs, request, view=self)
        page_ids = [m.id for m in page]

        # Per-member rollup — one query, conditional aggregation.
        rollup = {
            str(r["assignee_id"]): r
            for r in (
                base.filter(assignee_id__in=page_ids)
                .values("assignee_id")
                .annotate(
                    assigned=Count("id"),
                    open=Count("id", filter=Q(status__is_done=False)),
                    overdue=Count(
                        "id",
                        filter=Q(
                            status__is_done=False,
                            due_date__isnull=False,
                            due_date__lt=today,
                        ),
                    ),
                    completed=Count("id", filter=Q(status__is_done=True)),
                    points=Sum("estimate_points", filter=Q(status__is_done=False)),
                )
            )
        }

        # Per-day due heatmap cells — one query.
        day_counts = {str(m.id): {d: 0 for d in date_strs} for m in page}
        for t in base.filter(
            assignee_id__in=page_ids,
            due_date__gte=start_date,
            due_date__lte=today,
        ).values("assignee_id", "due_date"):
            aid = str(t["assignee_id"])
            k = t["due_date"].isoformat()
            if k in day_counts.get(aid, {}):
                day_counts[aid][k] += 1

        serializer = TeamMemberSerializer(
            page,
            many=True,
            context={"rollup": rollup, "day_counts": day_counts},
        )
        return paginator.get_paginated_response(serializer.data)


_DRILLDOWN_ORDER = {
    "recent": ("-id",),  # newest first (default)
    "oldest": ("id",),
    "due": ("due_date", "id"),  # soonest due / most overdue first
}


class TaskDrilldownView(APIView):
    """Paginated flat list of task rows — the shared click-through engine.

    Every chart segment click maps to a filtered query here. Cursor-paginated by
    ticket id (UUIDv7, time-sortable) so deep scrolling stays O(page_size).

    Accepts all shared filter params plus:
      order=recent|oldest|due
      page_size=N
    """

    permission_classes = [permissions.IsAuthenticated, access.APIKeyScopePermission]

    def get(self, request, workspace_id):
        workspace = access.authorize(
            request, workspace_id, perm="pm.view_analytics", scope="read"
        )
        params = request.query_params

        qs = _apply_task_filters(
            Task.objects.filter(board__workspace=workspace), params, workspace
        ).select_related("status", "assignee", "board")

        ordering = _DRILLDOWN_ORDER.get(params.get("order", "recent"), ("-id",))
        if "due_date" in ordering:
            # due-date ordering requires non-null due dates for a stable cursor
            qs = qs.filter(due_date__isnull=False)
        qs = qs.order_by(*ordering)

        paginator = TaskDrilldownPagination()
        paginator.ordering = ordering
        page = paginator.paginate_queryset(qs, request, view=self)
        data = TaskDrilldownSerializer(page, many=True).data
        return paginator.get_paginated_response(data)
