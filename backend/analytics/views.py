import datetime
import logging

from django.contrib.auth import get_user_model
from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import TruncDate, TruncMonth, TruncWeek
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.fields import parse_id
from core.pagination import HeatmapPagination
from .serializers import HeatmapMemberSerializer
from projects.models import Board, Sprint, Task, TaskActivity, TaskStatus
from workspaces.models import Workspace


def _parse_pk(value):
    try:
        return parse_id(value)
    except (ValueError, AttributeError, TypeError):
        return value


logger = logging.getLogger(__name__)

# Hard caps prevent arbitrary inputs from locking DB threads or causing memory exhaustion.
_MAX_DAYS = 365
_MAX_LIMIT = 20


# ==============================================================================
# ── INPUT VALIDATION HELPERS ──────────────────────────────────────────────────
# ==============================================================================


def _parse_days(params, default=30):
    """Safely extracts and constrains a day window interval from query arguments."""
    try:
        return min(max(1, int(params.get("days", default))), _MAX_DAYS)
    except (ValueError, TypeError):
        return default


def _parse_limit(params, default=8):
    """Safely extracts and constrains pagination sizes from query arguments."""
    try:
        return min(max(1, int(params.get("limit", default))), _MAX_LIMIT)
    except (ValueError, TypeError):
        return default


# ==============================================================================
# ── DISCOVERY AND LOOKUP HELPERS ──────────────────────────────────────────────
# ==============================================================================


def _done_status_names(workspace):
    """Retrieves an un-hydrated flat array of status name strings marked as completed."""
    return list(
        TaskStatus.objects.filter(board__workspace=workspace, is_done=True)
        .values_list("name", flat=True)
        .distinct()
    )


def _done_status_ids(workspace):
    """Retrieves an un-hydrated flat array of database identifiers marked as completed."""
    return list(
        TaskStatus.objects.filter(board__workspace=workspace, is_done=True).values_list(
            "id", flat=True
        )
    )


# ==============================================================================
# ── CORE DASHBOARD & SPRINT HANDLERS ──────────────────────────────────────────
# ==============================================================================


def _metric_overview(workspace, params):
    """High-level workspace snapshot: task volume, status/priority split, per-assignee load, 30-day trend.
    Example question: "Give me a snapshot of where everything stands right now." """
    all_tasks = Task.objects.filter(board__workspace=workspace)
    thirty_days_ago = timezone.now() - datetime.timedelta(days=30)

    trend_qs = (
        TaskActivity.objects.filter(
            task__board__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            created_at__gte=thirty_days_ago,
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )

    workload_qs = (
        Task.objects.filter(board__workspace=workspace, assignee__isnull=False)
        .values("assignee__id", "assignee__full_name", "assignee__email")
        .annotate(assigned=Count("id"))
        .order_by("-assigned")
    )

    workload = [
        {
            "name": r["assignee__full_name"] or r["assignee__email"].split("@")[0],
            "email": r["assignee__email"],
            "assigned": r["assigned"],
        }
        for r in workload_qs
    ]

    task_agg = all_tasks.aggregate(
        total=Count("id"),
        open=Count("id", filter=Q(status__is_done=False)),
    )
    return {
        "overview": {
            "boards": workspace.boards.count(),
            "tasks": task_agg["total"],
            "members": workspace.members.count(),
            "open_tasks": task_agg["open"],
        },
        "tasks_by_status": list(
            all_tasks.values("status__name", "status__color")
            .annotate(count=Count("id"))
            .order_by("-count")
        ),
        "tasks_by_priority": list(
            all_tasks.values("priority").annotate(count=Count("id")).order_by("-count")
        ),
        "workload": workload,
        "completion_trend": [
            {"date": str(item["day"]), "count": item["count"]} for item in trend_qs
        ],
    }


def _metric_velocity(workspace, params):
    """Completed story points and task count for the last N finished sprints.
    Example question: "How much work is the team actually delivering each sprint?" """
    board_id = params.get("board_id")
    limit = _parse_limit(params, 8)

    sprints_qs = Sprint.objects.filter(
        board__workspace=workspace, status=Sprint.Status.COMPLETED
    ).order_by("-end_date")

    if board_id:
        sprints_qs = sprints_qs.filter(board_id=board_id)

    sprints = list(reversed(sprints_qs[:limit]))
    sprint_ids = [s.id for s in sprints]
    done_ids = _done_status_ids(workspace)

    agg_map = {
        str(r["sprint_id"]): r
        for r in (
            Task.objects.filter(sprint_id__in=sprint_ids, status_id__in=done_ids)
            .values("sprint_id")
            .annotate(tc=Count("id"), sp=Sum("estimate_points"))
        )
    }

    rows, total_sp, total_tasks = [], 0, 0
    for sprint in sprints:
        agg = agg_map.get(str(sprint.id), {})
        tc = agg.get("tc", 0)
        sp = agg.get("sp") or 0
        total_sp += sp
        total_tasks += tc

        rows.append(
            {
                "sprint_id": str(sprint.id),
                "sprint_name": sprint.name,
                "start_date": str(sprint.start_date) if sprint.start_date else None,
                "end_date": str(sprint.end_date) if sprint.end_date else None,
                "tasks_completed": tc,
                "story_points": sp,
            }
        )

    n = len(rows)
    return {
        "sprints": rows,
        "avg_story_points": round(total_sp / n, 1) if n else 0,
        "avg_tasks_completed": round(total_tasks / n, 1) if n else 0,
    }


# ==============================================================================
# ── LEAD & CYCLE TIME METRICS ─────────────────────────────────────────────────
# ==============================================================================
#! Dead Code
def _metric_cycle_time(workspace, params):
    """Time from first active (out of backlog) to done — median/p75/p95.
    Example question: "Once we actually start a task, how long until it's finished?" """
    board_id = params.get("board_id")
    days = _parse_days(params, 90)
    cutoff = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts_qs = (
        TaskActivity.objects.filter(
            task__board__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            meta__to__in=done_names,
            created_at__gte=cutoff,
        )
        .values(
            "task_id",
            "task__title",
            "task__created_at",
            "task__priority",
            "task__task_type",
            "created_at",
        )
        .order_by("task_id", "created_at")
    )
    if board_id:
        acts_qs = acts_qs.filter(task__board_id=board_id)

    first_done = {}
    for act in acts_qs:
        tid = str(act["task_id"])
        if tid not in first_done:
            first_done[tid] = act

    if not first_done:
        return {
            "data_points": [],
            "stats": {"count": 0, "median": 0, "p75": 0, "p95": 0, "avg": 0},
        }

    first_active_map = {}
    for act in (
        TaskActivity.objects.filter(
            task_id__in=first_done.keys(), verb=TaskActivity.Verb.STATUS
        )
        .exclude(meta__to__in=done_names)
        .order_by("task_id", "created_at")
        .values("task_id", "created_at")
    ):
        tid = str(act["task_id"])
        if tid not in first_active_map:
            first_active_map[tid] = act["created_at"]

    points, cycle_times = [], []
    for tid, act in first_done.items():
        done_at = act["created_at"]
        task_start = act["task__created_at"]
        start = first_active_map.get(tid) or task_start
        cycle_days = (done_at - start).total_seconds() / 86400

        if cycle_days < 0:
            continue

        cycle_times.append(cycle_days)
        points.append(
            {
                "task_id": tid,
                "title": act["task__title"],
                "cycle_days": round(cycle_days, 1),
                "completed_date": done_at.date().isoformat(),
                "priority": act["task__priority"],
                "task_type": act["task__task_type"],
            }
        )

    if cycle_times:
        s = sorted(cycle_times)
        n = len(s)
        stats = {
            "count": n,
            "median": round(s[n // 2], 1),
            "p75": round(s[min(int(n * 0.75), n - 1)], 1),
            "p95": round(s[min(int(n * 0.95), n - 1)], 1),
            "avg": round(sum(s) / n, 1),
        }
    else:
        stats = {"count": 0, "median": 0, "p75": 0, "p95": 0, "avg": 0}

    return {"data_points": points, "stats": stats}


#! Dead Code
def _metric_lead_time(workspace, params):
    """Total elapsed time from task creation to done, bucketed into a histogram.
    Example question: "From the moment a request comes in, how long until we ship it?" """
    board_id = params.get("board_id")
    days = _parse_days(params, 90)
    cutoff = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts = (
        TaskActivity.objects.filter(
            task__board__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            meta__to__in=done_names,
            created_at__gte=cutoff,
        )
        .values("task_id", "task__title", "task__created_at", "created_at")
        .order_by("task_id", "created_at")[:5000]
    )
    if board_id:
        acts = acts.filter(task__board_id=board_id)

    seen, lead_times, points = set(), [], []
    for act in acts:
        tid = str(act["task_id"])
        if tid in seen:
            continue
        seen.add(tid)
        lt = (act["created_at"] - act["task__created_at"]).total_seconds() / 86400
        if lt < 0:
            continue
        lead_times.append(lt)
        points.append(
            {
                "task_id": tid,
                "title": act["task__title"],
                "lead_days": round(lt, 1),
                "completed_date": act["created_at"].date().isoformat(),
            }
        )

    buckets = [
        {"label": "< 1 day", "min": 0, "max": 1, "count": 0},
        {"label": "1–3 days", "min": 1, "max": 3, "count": 0},
        {"label": "3–7 days", "min": 3, "max": 7, "count": 0},
        {"label": "1–2 weeks", "min": 7, "max": 14, "count": 0},
        {"label": "2–4 weeks", "min": 14, "max": 30, "count": 0},
        {"label": "> 30 days", "min": 30, "max": 99999, "count": 0},
    ]
    for lt in lead_times:
        for b in buckets:
            if b["min"] <= lt < b["max"]:
                b["count"] += 1
                break

    if lead_times:
        s = sorted(lead_times)
        n = len(s)
        stats = {
            "count": n,
            "median": round(s[n // 2], 1),
            "avg": round(sum(s) / n, 1),
            "min": round(s[0], 1),
            "max": round(s[-1], 1),
        }
    else:
        stats = {"count": 0, "median": 0, "avg": 0, "min": 0, "max": 0}

    return {
        "histogram": [{"label": b["label"], "count": b["count"]} for b in buckets],
        "data_points": points[:100],
        "stats": stats,
    }


# ==============================================================================
# ── ADVANCED FLOW METRICS ─────────────────────────────────────────────────────
# ==============================================================================
#! Dead Code
def _metric_throughput(workspace, params):
    """Count of tasks completed per day / week / month.
    Example question: "How many items are we getting done each week?" """
    board_id = params.get("board_id")
    period = params.get("period", "week")
    days = _parse_days(params, 90)
    cutoff = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts = TaskActivity.objects.filter(
        task__board__workspace=workspace,
        verb=TaskActivity.Verb.STATUS,
        meta__to__in=done_names,
        created_at__gte=cutoff,
    )
    if board_id:
        acts = acts.filter(task__board_id=board_id)

    trunc_fn = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(
        period, TruncWeek
    )
    rows = (
        acts.annotate(bucket=trunc_fn("created_at"))
        .values("bucket")
        .annotate(count=Count("task", distinct=True))
        .order_by("bucket")
    )
    return [
        {
            "period": str(
                r["bucket"].date() if hasattr(r["bucket"], "date") else r["bucket"]
            ),
            "count": r["count"],
        }
        for r in rows
    ]


#! Dead Code
def _metric_cfd(workspace, params):
    """Cumulative flow — how many tasks sit in each status on each day over time.
    Example question: "Is work piling up in one column, e.g. Code Review (a bottleneck)?" """
    board_id = params.get("board_id")
    days = _parse_days(params, 30)

    if not board_id:
        board = workspace.boards.filter(status="active").order_by("pk").first()
        if not board:
            return {"statuses": [], "data": []}
        board_id = str(board.id)

    board = get_object_or_404(Board, id=_parse_pk(board_id), workspace=workspace)
    statuses = list(board.statuses.order_by("order").values("id", "name", "color"))
    if not statuses:
        return {"statuses": [], "data": []}

    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days - 1)
    name_to_id = {s["name"]: s["id"] for s in statuses}
    valid_sids = {s["id"] for s in statuses}

    acts = list(
        TaskActivity.objects.filter(task__board=board, verb=TaskActivity.Verb.STATUS)
        .order_by("task_id", "created_at")
        .values("task_id", "created_at", "meta")
    )

    task_timeline = {}
    task_initial_sid = {}

    for act in acts:
        tid = str(act["task_id"])
        meta = act["meta"] or {}
        from_sid = name_to_id.get(meta.get("from", ""))
        to_sid = name_to_id.get(meta.get("to", ""))

        if tid not in task_timeline and from_sid:
            task_initial_sid[tid] = from_sid

        if to_sid:
            task_timeline.setdefault(tid, []).append((act["created_at"].date(), to_sid))

    tasks_info = Task.objects.filter(board=board).values(
        "id", "created_at", "status_id"
    )

    running_counts = {s["id"]: 0 for s in statuses}
    delta_events = {}

    def _add_delta(date, sid, delta):
        if sid not in valid_sids:
            return
        day_map = delta_events.setdefault(date, {})
        day_map[sid] = day_map.get(sid, 0) + delta

    for t in tasks_info:
        tid = str(t["id"])
        created_day = t["created_at"].date()

        if created_day > end_date:
            continue

        initial_sid = task_initial_sid.get(tid, t["status_id"])
        timeline = task_timeline.get(tid, [])
        status_at_entry = initial_sid
        first_in_window_idx = len(timeline)

        for i, (change_day, to_sid) in enumerate(timeline):
            if change_day <= start_date:
                status_at_entry = to_sid
            else:
                first_in_window_idx = i
                break

        if created_day <= start_date:
            if status_at_entry in valid_sids:
                running_counts[status_at_entry] += 1
        else:
            _add_delta(created_day, initial_sid, +1)
            status_at_entry = initial_sid
            first_in_window_idx = 0

        prev_sid = status_at_entry
        for change_day, to_sid in timeline[first_in_window_idx:]:
            if change_day > end_date:
                break
            _add_delta(change_day, prev_sid, -1)
            _add_delta(change_day, to_sid, +1)
            prev_sid = to_sid

    data = []
    cur = start_date
    while cur <= end_date:
        for sid, delta in delta_events.get(cur, {}).items():
            running_counts[sid] = running_counts.get(sid, 0) + delta
        row = {"date": cur.isoformat()}
        for s in statuses:
            row[s["name"]] = max(0, running_counts.get(s["id"], 0))
        data.append(row)
        cur += datetime.timedelta(days=1)

    return {"statuses": statuses, "data": data}


def _metric_burnup(workspace, params):
    """Scope (total tasks) vs completed over a sprint/board timeline.
    Example question: "Are we on track to finish this scope, and is scope creeping up?" """
    sprint_id = params.get("sprint_id")
    board_id = params.get("board_id")
    done_names = _done_status_names(workspace)

    if sprint_id:
        sprint = get_object_or_404(Sprint, id=sprint_id, board__workspace=workspace)
        tasks_qs = Task.objects.filter(sprint=sprint)
        start_date = sprint.start_date or (
            datetime.date.today() - datetime.timedelta(days=14)
        )
        end_date = sprint.end_date or datetime.date.today()
    elif board_id:
        board = get_object_or_404(Board, id=_parse_pk(board_id), workspace=workspace)
        tasks_qs = Task.objects.filter(board=board)
        days = _parse_days(params, 30)
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days - 1)
    else:
        return {"error": "Provide sprint_id or board_id."}

    task_dates = sorted(
        r["created_at"].date() for r in tasks_qs.values("created_at") if r["created_at"]
    )

    first_done_dates = sorted(
        r["first_done"].date()
        for r in (
            TaskActivity.objects.filter(
                task__in=tasks_qs,
                verb=TaskActivity.Verb.STATUS,
                meta__to__in=done_names,
            )
            .values("task_id")
            .annotate(first_done=Min("created_at"))
        )
        if r["first_done"]
    )

    today = datetime.date.today()
    total_idx = done_idx = 0
    data = []
    cur = start_date

    while cur <= end_date:
        while total_idx < len(task_dates) and task_dates[total_idx] <= cur:
            total_idx += 1
        while done_idx < len(first_done_dates) and first_done_dates[done_idx] <= cur:
            done_idx += 1

        data.append(
            {
                "date": cur.isoformat(),
                "total": total_idx,
                "completed": done_idx,
                "is_future": cur > today,
            }
        )
        cur += datetime.timedelta(days=1)

    return {"data": data}


# ==============================================================================
# ── OPERATIONAL HEALTH & QUALITY METRICS ──────────────────────────────────────
# ==============================================================================


#! Dead Code
def _metric_time_in_status(workspace, params):
    """Average days a task spends in each status before moving on.
    Example question: "Which step in our workflow takes the longest to clear?" """
    board_id = params.get("board_id")
    days = _parse_days(params, 30)
    cutoff = timezone.now() - datetime.timedelta(days=days)

    acts_qs = (
        TaskActivity.objects.filter(
            task__board__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            created_at__gte=cutoff,
        )
        .order_by("task_id", "created_at")
        .values("task_id", "created_at", "meta")
    )
    if board_id:
        acts_qs = acts_qs.filter(task__board_id=board_id)

    task_acts = {}
    for act in acts_qs:
        task_acts.setdefault(str(act["task_id"]), []).append(act)

    created_map = {
        str(t["id"]): t["created_at"]
        for t in Task.objects.filter(id__in=task_acts.keys()).values("id", "created_at")
    }

    status_durations = {}
    for tid, acts in task_acts.items():
        prev_time = created_map.get(tid)
        if not prev_time:
            continue
        for act in acts:
            from_status = (act["meta"] or {}).get("from")
            if not from_status:
                prev_time = act["created_at"]
                continue
            duration = (act["created_at"] - prev_time).total_seconds() / 86400
            if 0 <= duration < 365:
                status_durations.setdefault(from_status, []).append(duration)
            prev_time = act["created_at"]

    result = []
    for name, durations in status_durations.items():
        avg = sum(durations) / len(durations)
        result.append(
            {
                "status": name,
                "avg_days": round(avg, 1),
                "sample_count": len(durations),
            }
        )

    return sorted(result, key=lambda x: -x["avg_days"])


def _metric_overdue_aging(workspace, params):
    """Overdue open tasks grouped by how many days late they are.
    Example question: "What's overdue right now, and how badly are we slipping?" """
    board_id = params.get("board_id")
    today = datetime.date.today()

    qs = Task.objects.filter(
        board__workspace=workspace,
        due_date__lt=today,
        due_date__isnull=False,
        status__is_done=False,
    ).values(
        "id",
        "title",
        "due_date",
        "priority",
        "estimate_points",
        "assignee__full_name",
        "assignee__email",
        "status__name",
        "board__name",
    )
    if board_id:
        qs = qs.filter(board_id=board_id)

    buckets = [
        {"label": "1–3 days", "min": 1, "max": 3, "count": 0},
        {"label": "4–7 days", "min": 4, "max": 7, "count": 0},
        {"label": "1–2 weeks", "min": 8, "max": 14, "count": 0},
        {"label": "2–4 weeks", "min": 15, "max": 30, "count": 0},
        {"label": "> 30 days", "min": 31, "max": 99999, "count": 0},
    ]

    items = []
    for t in qs:
        days_overdue = (today - t["due_date"]).days
        for b in buckets:
            if b["min"] <= days_overdue <= b["max"]:
                b["count"] += 1
                break
        assignee = (
            t["assignee__full_name"]
            or (t["assignee__email"] or "").split("@")[0]
            or "Unassigned"
        )
        items.append(
            {
                "id": str(t["id"]),
                "title": t["title"],
                "days_overdue": days_overdue,
                "due_date": t["due_date"].isoformat() if t["due_date"] else None,
                "priority": t["priority"],
                "estimate_points": t["estimate_points"],
                "assignee": assignee,
                "status": t["status__name"],
                "board": t["board__name"],
            }
        )

    items.sort(key=lambda x: -x["days_overdue"])

    return {
        "total": len(items),
        "buckets": [{"label": b["label"], "count": b["count"]} for b in buckets],
        "tasks": items[:50],
    }


def _metric_completion_rate(workspace, params):
    """Per finished sprint, the % of planned tasks that were actually completed.
    Example question: "Did we deliver what we committed to this sprint?" """
    board_id = params.get("board_id")
    limit = _parse_limit(params, 8)
    done_ids = _done_status_ids(workspace)

    sprints_qs = Sprint.objects.filter(
        board__workspace=workspace, status=Sprint.Status.COMPLETED
    ).order_by("-end_date")
    if board_id:
        sprints_qs = sprints_qs.filter(board_id=board_id)

    sprints = list(reversed(sprints_qs[:limit]))
    sprint_ids = [s.id for s in sprints]

    total_map = {
        str(r["sprint_id"]): r["c"]
        for r in Task.objects.filter(sprint_id__in=sprint_ids)
        .values("sprint_id")
        .annotate(c=Count("id"))
    }
    done_map = {
        str(r["sprint_id"]): r["c"]
        for r in Task.objects.filter(sprint_id__in=sprint_ids, status_id__in=done_ids)
        .values("sprint_id")
        .annotate(c=Count("id"))
    }

    rows = []
    for sprint in sprints:
        sid = str(sprint.id)
        total = total_map.get(sid, 0)
        done = done_map.get(sid, 0)
        rows.append(
            {
                "sprint_name": sprint.name,
                "total": total,
                "done": done,
                "rate": round((done / total) * 100) if total else 0,
            }
        )

    return rows


#! Dead Code
def _metric_estimation_accuracy(workspace, params):
    """Estimated story points vs actual cycle time per sprint.
    Example question: "Which kinds of work do we consistently underestimate?" """
    board_id = params.get("board_id")
    limit = _parse_limit(params, 8)
    done_ids = _done_status_ids(workspace)
    done_names = _done_status_names(workspace)

    sprints_qs = Sprint.objects.filter(
        board__workspace=workspace, status=Sprint.Status.COMPLETED
    ).order_by("-end_date")
    if board_id:
        sprints_qs = sprints_qs.filter(board_id=board_id)

    sprints = list(reversed(sprints_qs[:limit]))
    sprint_ids = [s.id for s in sprints]

    tasks = list(
        Task.objects.filter(sprint_id__in=sprint_ids, status_id__in=done_ids)
        .exclude(estimate_points=None)
        .values("id", "sprint_id", "estimate_points", "created_at")
    )
    task_ids = [t["id"] for t in tasks]

    first_done_map = {}
    for act in (
        TaskActivity.objects.filter(
            task_id__in=task_ids, verb=TaskActivity.Verb.STATUS, meta__to__in=done_names
        )
        .order_by("task_id", "created_at")
        .values("task_id", "created_at")
    ):
        tid = str(act["task_id"])
        if tid not in first_done_map:
            first_done_map[tid] = act["created_at"]

    sprint_data = {str(s.id): {"sprint": s, "sp": 0, "cycle_days": []} for s in sprints}
    for t in tasks:
        sid = str(t["sprint_id"])
        tid = str(t["id"])
        sprint_data[sid]["sp"] += t["estimate_points"] or 0
        if tid in first_done_map:
            ct = (first_done_map[tid] - t["created_at"]).total_seconds() / 86400
            if ct >= 0:
                sprint_data[sid]["cycle_days"].append(ct)

    rows = []
    for s in sprints:
        d = sprint_data[str(s.id)]
        cd = d["cycle_days"]
        rows.append(
            {
                "sprint_name": s.name,
                "estimated_sp": d["sp"],
                "avg_cycle_days": round(sum(cd) / len(cd), 1) if cd else None,
            }
        )

    return rows if any(r["estimated_sp"] > 0 for r in rows) else []


# ==============================================================================
# ── METRIC REGISTRY & ROUTING VIEW ────────────────────────────────────────────
# ==============================================================================
def _metric_sprint_burndown(workspace, params):
    """Ideal vs actual remaining-work line across a single sprint's days.
    Example question: "Are we burning down fast enough to finish this sprint on time?" """
    sprint_id = params.get("sprint_id")
    board_id = params.get("board_id")

    if not sprint_id or not board_id:
        return {"error": "sprint_id and board_id are required."}

    board = get_object_or_404(Board, id=_parse_pk(board_id), workspace=workspace)
    sprint = get_object_or_404(Sprint, id=sprint_id, board=board)

    if not sprint.start_date or not sprint.end_date:
        return {"error": "Sprint dates not set."}

    done_status = board.statuses.order_by("-order").first()
    sprint_tasks = sprint.tasks.all()
    total = sprint_tasks.count()

    done_name = done_status.name if done_status else "Done"

    # One query: earliest date each task was marked done.
    first_done_by_date = {}
    for row in (
        TaskActivity.objects.filter(
            task__sprint=sprint,
            verb=TaskActivity.Verb.STATUS,
            meta__to=done_name,
        )
        .values("task_id")
        .annotate(first_done=Min("created_at"))
    ):
        d = row["first_done"].date()
        first_done_by_date[d] = first_done_by_date.get(d, 0) + 1

    today = datetime.date.today()
    days_list, ideal, actual = [], [], []
    total_days = max((sprint.end_date - sprint.start_date).days, 1)
    current = sprint.start_date
    cumulative_done = 0
    idx = 0

    while current <= sprint.end_date:
        days_list.append(current.strftime("%b %d"))
        ideal.append(round(total * (1 - idx / total_days), 1))

        if current <= today:
            cumulative_done += first_done_by_date.get(current, 0)
            actual.append(max(total - cumulative_done, 0))
        else:
            actual.append(None)

        current += datetime.timedelta(days=1)
        idx += 1

    completed = sprint_tasks.filter(status=done_status).count() if done_status else 0
    return {
        "total": total,
        "completed": completed,
        "remaining": total - completed,
        "days": days_list,
        "ideal": ideal,
        "actual": actual,
    }


# ==============================================================================
# ── DYNAMIC AGGREGATE ENDPOINT ────────────────────────────────────────────────
# ==============================================================================

_AGG_PAGE_SIZE_MAX = 50
_AGG_PAGE_SIZE_DEFAULT = 25

_VALID_GROUP_BY = {"assignee", "status", "priority", "type", "board", "sprint", "date"}
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
    "sprint": {
        "values": ["sprint_id", "sprint__name"],
        "key": "sprint_id",
        "label": lambda r: r.get("sprint__name") or "No Sprint",
    },
    "date": {
        "values": [],
        "key": "day",
        "label": lambda r: str(r.get("day", "")),
    },
}


def _parse_date_param(value):
    """Convert '14d' (relative) or an ISO datetime string into a timezone-aware datetime."""
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


def _metric_aggregate(workspace, params):
    """
    Universal aggregate endpoint — answers any grouping/filter query in one call.
    Example question: "How many open high-priority bugs does each person have?"

    group_by : assignee | status | priority | type | board | sprint | date
    metric   : count (default) | story_points

    Supported filters (all optional, all additive/AND):
      board_id / filter[board]   — board UUID
      filter[status]             — comma-separated status UUIDs
      filter[priority]           — comma-separated priority values
      filter[type]               — comma-separated task_type values
      filter[assignee]           — single user UUID
      filter[sprint]             — sprint UUID | "current" | "last"
      filter[is_blocked]         — "true" | "false"
      filter[open]               — "true" = not done, "false" = done
      filter[created_before]     — "14d" or ISO date
      filter[created_after]      — "30d" or ISO date
      filter[due_before]         — ISO date (YYYY-MM-DD)

    Pagination:
      page      — default 1
      page_size — default 25, max 50
    """
    group_by = params.get("group_by", "status")
    if group_by not in _VALID_GROUP_BY:
        group_by = "status"

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

    # ── Base queryset — workspace-scoped, no model hydration ──────────────────
    qs = Task.objects.filter(board__workspace=workspace)

    # ── Apply filters ─────────────────────────────────────────────────────────
    board_id = params.get("filter[board]") or params.get("board_id")
    if board_id:
        qs = qs.filter(board_id=_parse_pk(board_id))

    if params.get("filter[status]"):
        ids = [_parse_pk(s) for s in params["filter[status]"].split(",") if s.strip()]
        qs = qs.filter(status_id__in=ids)

    if params.get("filter[priority]"):
        qs = qs.filter(
            priority__in=[
                p.strip() for p in params["filter[priority]"].split(",") if p.strip()
            ]
        )

    if params.get("filter[type]"):
        qs = qs.filter(
            task_type__in=[
                t.strip() for t in params["filter[type]"].split(",") if t.strip()
            ]
        )

    if params.get("filter[assignee]"):
        qs = qs.filter(assignee_id=_parse_pk(params["filter[assignee]"]))

    f_sprint = params.get("filter[sprint]")
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
            qs = qs.filter(sprint_id=_parse_pk(f_sprint))

    f_is_blocked = (params.get("filter[is_blocked]") or "").lower()
    if f_is_blocked == "true":
        qs = qs.filter(blocked_by_deps__isnull=False).distinct()
    elif f_is_blocked == "false":
        qs = qs.filter(blocked_by_deps__isnull=True)

    f_open = (params.get("filter[open]") or "").lower()
    if f_open == "true":
        qs = qs.filter(status__is_done=False)
    elif f_open == "false":
        qs = qs.filter(status__is_done=True)

    dt_before = _parse_date_param(params.get("filter[created_before]"))
    if dt_before:
        qs = qs.filter(created_at__lte=dt_before)

    dt_after = _parse_date_param(params.get("filter[created_after]"))
    if dt_after:
        qs = qs.filter(created_at__gte=dt_after)

    if params.get("filter[due_before]"):
        try:
            qs = qs.filter(
                due_date__lte=datetime.date.fromisoformat(params["filter[due_before]"])
            )
        except (ValueError, TypeError):
            pass

    # ── Build GROUP BY + aggregate ────────────────────────────────────────────
    cfg = _GROUP_CONFIG[group_by]

    if group_by == "date":
        agg_qs = qs.annotate(day=TruncDate("created_at")).values("day")
    else:
        agg_qs = qs.values(*cfg["values"])

    if agg_metric == "story_points":
        agg_qs = agg_qs.annotate(value=Sum("estimate_points")).order_by("-value")
    else:
        agg_qs = agg_qs.annotate(value=Count("id")).order_by("-value")

    # Total task count matching filters (before grouping — used for stat pills)
    total_tasks = qs.aggregate(n=Count("id"))["n"]

    # Load all group rows into memory — safe because groups are bounded
    # (status: ~10, priority: 5, type: 7, assignee: ~1k max, date: ~365 max)
    all_rows = list(agg_qs)
    total_groups = len(all_rows)
    offset = (page - 1) * page_size
    page_rows = all_rows[offset : offset + page_size]

    # ── Format results ────────────────────────────────────────────────────────
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
        "group_by": group_by,
        "metric": agg_metric,
        "total": total_tasks,
        "total_groups": total_groups,
        "page": page,
        "page_size": page_size,
        "has_more": (offset + page_size) < total_groups,
        "results": results,
    }


# Only metrics with a live frontend caller are registered. The metrics below
# have NO active consumer (verified against frontend/src) and are disabled here
# to shrink the surface we have to scale/cache. Their handler functions are kept
# in this module (unreferenced) for easy re-enable — uncomment to restore:
#   "cycle_time": _metric_cycle_time,
#   "lead_time": _metric_lead_time,
#   "throughput": _metric_throughput,
#   "cfd": _metric_cfd,
#   "time_in_status": _metric_time_in_status,
#   "estimation_accuracy": _metric_estimation_accuracy,
#   "sprint_burndown": _metric_sprint_burndown,  # hook is commented out in SprintPanel.jsx
METRICS = {
    "overview": _metric_overview,
    "velocity": _metric_velocity,
    "burnup": _metric_burnup,
    "overdue_aging": _metric_overdue_aging,
    "completion_rate": _metric_completion_rate,
    "aggregate": _metric_aggregate,
}


class AnalyticsMetricView(APIView):
    """Central structural router processing specific target dashboard metric tracking calculations."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_id, metric):
        handler = METRICS.get(metric)
        if not handler:
            return Response(
                {"error": f"Unknown metric '{metric}'.", "available": sorted(METRICS)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        workspace = get_object_or_404(
            Workspace, id=_parse_pk(workspace_id), members__user=request.user
        )
        return Response(handler(workspace, request.query_params))


class WorkloadHeatmapView(APIView):
    """Task counts per assignee per day over a window — who's loaded, and when.
    Example question: "Who is overloaded right now and who has spare capacity?" """

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = HeatmapPagination

    def get(self, request, workspace_id):
        User = get_user_model()
        workspace = get_object_or_404(
            Workspace, id=_parse_pk(workspace_id), members__user=request.user
        )

        # ── Filters ───────────────────────────────────────────────────────────
        days = _parse_days(request.query_params, 14)
        board_id = request.query_params.get("board_id")

        # Build the ordered list of date column labels (ISO strings)
        end_date = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days - 1)
        date_strs = [
            (start_date + datetime.timedelta(days=i)).isoformat() for i in range(days)
        ]

        # ── Base task queryset ────────────────────────────────────────────────
        # Only tasks that have an assignee and a due date within the window
        tasks_qs = Task.objects.filter(
            board__workspace=workspace,
            assignee__isnull=False,
            due_date__gte=start_date,
            due_date__lte=end_date,
        )
        if board_id:
            tasks_qs = tasks_qs.filter(board_id=board_id)

        # ── Member queryset (paginated) ───────────────────────────────────────
        # Collect distinct assignee IDs first, then fetch only the fields we need — avoids inflating full User objects (password hash, perms, etc.)
        member_ids = tasks_qs.values_list("assignee_id", flat=True).distinct()
        member_qs = (
            User.objects.filter(id__in=member_ids)
            .only("id", "full_name", "email")
            .order_by(
                "full_name", "id"
            )  # compound: must match HeatmapPagination.ordering exactly
        )

        # HeatmapPagination (CursorPagination) slices member_qs and attaches next / previous cursor links to the response automatically
        paginator = self.pagination_class()
        page = paginator.paginate_queryset(member_qs, request, view=self)

        # ── Task counts for this page only ────────────────────────────────────
        # Re-filter tasks to the members on this page to avoid a full-table scan
        page_ids = [m.id for m in page]
        task_rows = tasks_qs.filter(assignee_id__in=page_ids).values(
            "assignee_id", "due_date"
        )

        # Initialise every cell to 0, then increment from task rows
        day_counts = {str(m.id): {d: 0 for d in date_strs} for m in page}
        for t in task_rows:
            aid = str(t["assignee_id"])
            k = t["due_date"].isoformat()
            if k in day_counts.get(aid, {}):
                day_counts[aid][k] += 1

        serializer = HeatmapMemberSerializer(
            page, many=True, context={"day_counts": day_counts}
        )

        response = paginator.get_paginated_response(serializer.data)
        response.data["dates"] = date_strs
        return response
