from rest_framework import permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate, TruncWeek, TruncMonth
from django.utils import timezone
import datetime

from workspaces.models import Workspace
from projects.models import Task, TaskStatus, TaskActivity, Sprint, TimeEntry, Project
from .models import Report
from .serializers import ReportSerializer


# ── Shared helpers ────────────────────────────────────────────────────────────

def _done_status_names(workspace):
    """Return distinct 'done' status names across all projects in a workspace."""
    return list(
        TaskStatus.objects.filter(project__workspace=workspace, is_done=True)
        .values_list("name", flat=True)
        .distinct()
    )


# ── Metric handlers ───────────────────────────────────────────────────────────
# Each handler receives (workspace, params) and returns serialisable data.
# Registering a new metric is just adding a function + one entry in METRICS.

def _metric_overview(workspace, params):
    all_tasks = Task.objects.filter(project__workspace=workspace)
    members = workspace.members.select_related("user").all()

    thirty_days_ago = timezone.now() - datetime.timedelta(days=30)
    trend_qs = (
        TaskActivity.objects
        .filter(
            task__project__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            created_at__gte=thirty_days_ago,
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(count=Count("id"))
        .order_by("day")
    )

    workload = sorted([
        {
            "name":     m.user.full_name or m.user.email.split("@")[0],
            "email":    m.user.email,
            "assigned": all_tasks.filter(assignee=m.user).count(),
        }
        for m in members
    ], key=lambda x: x["assigned"], reverse=True)

    return {
        "overview": {
            "projects":   workspace.projects.count(),
            "tasks":      all_tasks.count(),
            "members":    members.count(),
            "open_tasks": all_tasks.filter(status__is_done=False).count(),
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
            {"date": str(item["day"]), "count": item["count"]}
            for item in trend_qs
        ],
    }


def _metric_velocity(workspace, params):
    project_id = params.get("project_id")
    limit      = int(params.get("limit", 8))

    sprints_qs = Sprint.objects.filter(
        project__workspace=workspace,
        status=Sprint.Status.COMPLETED,
    ).order_by("-end_date")
    if project_id:
        sprints_qs = sprints_qs.filter(project_id=project_id)

    sprints  = list(reversed(sprints_qs[:limit]))
    done_ids = list(
        TaskStatus.objects.filter(project__workspace=workspace, is_done=True)
        .values_list("id", flat=True)
    )

    rows, total_sp, total_tasks = [], 0, 0
    for sprint in sprints:
        done_tasks = Task.objects.filter(sprint=sprint, status_id__in=done_ids)
        tc  = done_tasks.count()
        sp  = done_tasks.aggregate(s=Sum("estimate_points"))["s"] or 0
        total_sp    += sp
        total_tasks += tc
        rows.append({
            "sprint_id":       str(sprint.id),
            "sprint_name":     sprint.name,
            "start_date":      str(sprint.start_date) if sprint.start_date else None,
            "end_date":        str(sprint.end_date)   if sprint.end_date   else None,
            "tasks_completed": tc,
            "story_points":    sp,
        })

    n = len(rows)
    return {
        "sprints":             rows,
        "avg_story_points":    round(total_sp    / n, 1) if n else 0,
        "avg_tasks_completed": round(total_tasks / n, 1) if n else 0,
    }


def _metric_cycle_time(workspace, params):
    project_id = params.get("project_id")
    days       = int(params.get("days", 90))
    cutoff     = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts = (
        TaskActivity.objects
        .filter(
            task__project__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            meta__to__in=done_names,
            created_at__gte=cutoff,
        )
        .select_related("task")
        .order_by("task_id", "created_at")
    )
    if project_id:
        acts = acts.filter(task__project_id=project_id)

    first_done = {}
    for act in acts:
        tid = str(act.task_id)
        if tid not in first_done:
            first_done[tid] = act

    points, cycle_times = [], []
    for tid, act in first_done.items():
        task    = act.task
        done_at = act.created_at

        first_active = (
            TaskActivity.objects
            .filter(task_id=tid, verb=TaskActivity.Verb.STATUS, created_at__lt=done_at)
            .exclude(meta__to__in=done_names)
            .order_by("created_at")
            .first()
        )
        start      = first_active.created_at if first_active else task.created_at
        cycle_days = (done_at - start).total_seconds() / 86400
        if cycle_days < 0:
            continue
        cycle_times.append(cycle_days)
        points.append({
            "task_id":        tid,
            "title":          task.title,
            "cycle_days":     round(cycle_days, 1),
            "completed_date": done_at.date().isoformat(),
            "priority":       task.priority,
            "task_type":      task.task_type,
        })

    if cycle_times:
        s = sorted(cycle_times)
        n = len(s)
        stats = {
            "count":  n,
            "median": round(s[n // 2], 1),
            "p75":    round(s[min(int(n * 0.75), n - 1)], 1),
            "p95":    round(s[min(int(n * 0.95), n - 1)], 1),
            "avg":    round(sum(s) / n, 1),
        }
    else:
        stats = {"count": 0, "median": 0, "p75": 0, "p95": 0, "avg": 0}

    return {"data_points": points, "stats": stats}


def _metric_lead_time(workspace, params):
    project_id = params.get("project_id")
    days       = int(params.get("days", 90))
    cutoff     = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts = (
        TaskActivity.objects
        .filter(
            task__project__workspace=workspace,
            verb=TaskActivity.Verb.STATUS,
            meta__to__in=done_names,
            created_at__gte=cutoff,
        )
        .select_related("task")
        .order_by("task_id", "created_at")
    )
    if project_id:
        acts = acts.filter(task__project_id=project_id)

    seen, lead_times, points = set(), [], []
    for act in acts:
        tid = str(act.task_id)
        if tid in seen:
            continue
        seen.add(tid)
        lt = (act.created_at - act.task.created_at).total_seconds() / 86400
        if lt < 0:
            continue
        lead_times.append(lt)
        points.append({
            "task_id":        tid,
            "title":          act.task.title,
            "lead_days":      round(lt, 1),
            "completed_date": act.created_at.date().isoformat(),
        })

    buckets = [
        {"label": "< 1 day",   "min": 0,  "max": 1,     "count": 0},
        {"label": "1–3 days",  "min": 1,  "max": 3,     "count": 0},
        {"label": "3–7 days",  "min": 3,  "max": 7,     "count": 0},
        {"label": "1–2 weeks", "min": 7,  "max": 14,    "count": 0},
        {"label": "2–4 weeks", "min": 14, "max": 30,    "count": 0},
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
            "count":  n,
            "median": round(s[n // 2], 1),
            "avg":    round(sum(s) / n, 1),
            "min":    round(s[0], 1),
            "max":    round(s[-1], 1),
        }
    else:
        stats = {"count": 0, "median": 0, "avg": 0, "min": 0, "max": 0}

    return {
        "histogram":   [{"label": b["label"], "count": b["count"]} for b in buckets],
        "data_points": points[:100],
        "stats":       stats,
    }


def _metric_throughput(workspace, params):
    project_id = params.get("project_id")
    period     = params.get("period", "week")
    days       = int(params.get("days", 90))
    cutoff     = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)

    acts = TaskActivity.objects.filter(
        task__project__workspace=workspace,
        verb=TaskActivity.Verb.STATUS,
        meta__to__in=done_names,
        created_at__gte=cutoff,
    )
    if project_id:
        acts = acts.filter(task__project_id=project_id)

    trunc_fn = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(period, TruncWeek)
    rows = (
        acts
        .annotate(bucket=trunc_fn("created_at"))
        .values("bucket")
        .annotate(count=Count("task", distinct=True))
        .order_by("bucket")
    )
    return [
        {
            "period": str(r["bucket"].date() if hasattr(r["bucket"], "date") else r["bucket"]),
            "count":  r["count"],
        }
        for r in rows
    ]


def _metric_cfd(workspace, params):
    project_id = params.get("project_id")
    days       = int(params.get("days", 30))

    if not project_id:
        project = workspace.projects.filter(is_archived=False).order_by("created_at").first()
        if not project:
            return {"statuses": [], "data": []}
        project_id = str(project.id)

    project  = get_object_or_404(Project, id=project_id, workspace=workspace)
    statuses = list(project.statuses.order_by("order").values("id", "name", "color"))

    end_date   = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days - 1)
    name_to_id = {s["name"]: s["id"] for s in statuses}

    acts = list(
        TaskActivity.objects
        .filter(task__project=project, verb=TaskActivity.Verb.STATUS)
        .order_by("task_id", "created_at")
        .values("task_id", "created_at", "meta")
    )

    task_timeline = {}
    for act in acts:
        tid = str(act["task_id"])
        sid = name_to_id.get((act["meta"] or {}).get("to", ""))
        if sid:
            task_timeline.setdefault(tid, []).append((act["created_at"].date(), sid))

    tasks_info = Task.objects.filter(project=project).values("id", "created_at", "status_id")
    task_meta  = {str(t["id"]): t for t in tasks_info}

    date_counts = {}
    cur = start_date
    while cur <= end_date:
        date_counts[cur] = {s["id"]: 0 for s in statuses}
        cur += datetime.timedelta(days=1)

    for tid, meta in task_meta.items():
        created_day = meta["created_at"].date()
        initial_sid = meta["status_id"]
        timeline    = task_timeline.get(tid, [])
        for day in date_counts:
            if day < created_day:
                continue
            current_sid = initial_sid
            for change_day, sid in timeline:
                if change_day <= day:
                    current_sid = sid
                else:
                    break
            if current_sid in date_counts[day]:
                date_counts[day][current_sid] += 1

    data = []
    cur = start_date
    while cur <= end_date:
        row = {"date": cur.isoformat()}
        for s in statuses:
            row[s["name"]] = date_counts[cur].get(s["id"], 0)
        data.append(row)
        cur += datetime.timedelta(days=1)

    return {"statuses": statuses, "data": data}


def _metric_burnup(workspace, params):
    sprint_id  = params.get("sprint_id")
    project_id = params.get("project_id")
    done_names = _done_status_names(workspace)

    if sprint_id:
        sprint     = get_object_or_404(Sprint, id=sprint_id, project__workspace=workspace)
        tasks_qs   = Task.objects.filter(sprint=sprint)
        start_date = sprint.start_date or (datetime.date.today() - datetime.timedelta(days=14))
        end_date   = sprint.end_date   or datetime.date.today()
    elif project_id:
        project    = get_object_or_404(Project, id=project_id, workspace=workspace)
        tasks_qs   = Task.objects.filter(project=project)
        days       = int(params.get("days", 30))
        end_date   = datetime.date.today()
        start_date = end_date - datetime.timedelta(days=days - 1)
    else:
        return {"error": "Provide sprint_id or project_id."}

    today = datetime.date.today()
    data, cur = [], start_date
    while cur <= end_date:
        total     = tasks_qs.filter(created_at__date__lte=cur).count()
        completed = (
            TaskActivity.objects
            .filter(
                task__in=tasks_qs,
                verb=TaskActivity.Verb.STATUS,
                meta__to__in=done_names,
                created_at__date__lte=cur,
            )
            .values("task")
            .distinct()
            .count()
        )
        data.append({
            "date":      cur.isoformat(),
            "total":     total,
            "completed": completed,
            "is_future": cur > today,
        })
        cur += datetime.timedelta(days=1)

    return {"data": data}


def _metric_workload_heatmap(workspace, params):
    days       = int(params.get("days", 14))
    project_id = params.get("project_id")

    end_date   = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days - 1)
    dates      = []
    cur = start_date
    while cur <= end_date:
        dates.append(cur)
        cur += datetime.timedelta(days=1)

    members = workspace.members.select_related("user").all()
    rows    = []

    for member in members:
        user = member.user
        name = user.full_name or user.email.split("@")[0]
        qs   = Task.objects.filter(project__workspace=workspace, assignee=user)
        if project_id:
            qs = qs.filter(project_id=project_id)

        assigned = list(qs.filter(
            due_date__gte=start_date, due_date__lte=end_date
        ).values("due_date"))

        day_counts = {d.isoformat(): 0 for d in dates}
        for t in assigned:
            k = t["due_date"].isoformat()
            if k in day_counts:
                day_counts[k] += 1

        total = sum(day_counts.values())
        if total > 0:
            rows.append({
                "user_id": str(user.id),
                "name":    name,
                "email":   user.email,
                "days":    day_counts,
                "total":   total,
            })

    return {"dates": [d.isoformat() for d in dates], "members": rows}


# ── Report data sources (used by ReportDataView) ──────────────────────────────

def _report_tasks(workspace, cfg):
    project_id = cfg.get("project_id")
    group_by   = cfg.get("group_by", "status")
    days       = int(cfg.get("date_range_days", 30))
    cutoff     = timezone.now() - datetime.timedelta(days=days)

    qs = Task.objects.filter(project__workspace=workspace, created_at__gte=cutoff)
    if project_id:
        qs = qs.filter(project_id=project_id)

    if group_by == "status":
        rows = list(qs.values("status__name", "status__color").annotate(count=Count("id")).order_by("-count"))
        return [{"label": r["status__name"] or "No status", "value": r["count"], "color": r["status__color"]} for r in rows]
    if group_by == "priority":
        rows = list(qs.values("priority").annotate(count=Count("id")).order_by("-count"))
        return [{"label": r["priority"] or "none", "value": r["count"]} for r in rows]
    if group_by == "assignee":
        rows = list(qs.values("assignee__full_name", "assignee__email").annotate(count=Count("id")).order_by("-count"))
        return [
            {"label": r["assignee__full_name"] or (r["assignee__email"] or "Unassigned").split("@")[0], "value": r["count"]}
            for r in rows
        ]
    if group_by == "task_type":
        rows = list(qs.values("task_type").annotate(count=Count("id")).order_by("-count"))
        return [{"label": r["task_type"] or "task", "value": r["count"]} for r in rows]
    return []


def _report_time_entries(workspace, cfg):
    project_id = cfg.get("project_id")
    group_by   = cfg.get("group_by", "member")
    days       = int(cfg.get("date_range_days", 30))
    cutoff     = timezone.now() - datetime.timedelta(days=days)

    qs = TimeEntry.objects.filter(task__project__workspace=workspace, start_at__gte=cutoff).exclude(end_at=None)
    if project_id:
        qs = qs.filter(task__project_id=project_id)

    if group_by == "member":
        rows = list(qs.values("user__full_name", "user__email").annotate(total_seconds=Sum("duration_seconds")).order_by("-total_seconds"))
        return [
            {"label": r["user__full_name"] or (r["user__email"] or "").split("@")[0], "value": round((r["total_seconds"] or 0) / 3600, 2)}
            for r in rows
        ]
    if group_by == "project":
        rows = list(qs.values("task__project__name").annotate(total_seconds=Sum("duration_seconds")).order_by("-total_seconds"))
        return [{"label": r["task__project__name"] or "Unknown", "value": round((r["total_seconds"] or 0) / 3600, 2)} for r in rows]
    return []


def _report_velocity(workspace, cfg):
    project_id = cfg.get("project_id")
    sprints_qs = Sprint.objects.filter(project__workspace=workspace, status=Sprint.Status.COMPLETED).order_by("-end_date")[:8]
    if project_id:
        sprints_qs = sprints_qs.filter(project_id=project_id)
    done_ids = list(TaskStatus.objects.filter(project__workspace=workspace, is_done=True).values_list("id", flat=True))
    rows = []
    for sprint in reversed(list(sprints_qs)):
        done = Task.objects.filter(sprint=sprint, status_id__in=done_ids)
        sp   = done.aggregate(s=Sum("estimate_points"))["s"] or 0
        rows.append({"label": sprint.name, "value": done.count(), "story_points": sp})
    return rows


def _report_throughput(workspace, cfg):
    project_id = cfg.get("project_id")
    period     = cfg.get("period", "week")
    days       = int(cfg.get("date_range_days", 60))
    cutoff     = timezone.now() - datetime.timedelta(days=days)
    done_names = _done_status_names(workspace)
    acts = TaskActivity.objects.filter(
        task__project__workspace=workspace, verb=TaskActivity.Verb.STATUS,
        meta__to__in=done_names, created_at__gte=cutoff,
    )
    if project_id:
        acts = acts.filter(task__project_id=project_id)
    trunc_fn = {"day": TruncDate, "week": TruncWeek, "month": TruncMonth}.get(period, TruncWeek)
    rows = acts.annotate(bucket=trunc_fn("created_at")).values("bucket").annotate(count=Count("task", distinct=True)).order_by("bucket")
    return [
        {"label": str(r["bucket"].date() if hasattr(r["bucket"], "date") else r["bucket"]), "value": r["count"]}
        for r in rows
    ]


_REPORT_DATA_SOURCES = {
    "tasks":        _report_tasks,
    "time_entries": _report_time_entries,
    "velocity":     _report_velocity,
    "throughput":   _report_throughput,
}


# ── Metric registry ───────────────────────────────────────────────────────────

METRICS = {
    "overview":        _metric_overview,
    "velocity":        _metric_velocity,
    "cycle_time":      _metric_cycle_time,
    "lead_time":       _metric_lead_time,
    "throughput":      _metric_throughput,
    "cfd":             _metric_cfd,
    "burnup":          _metric_burnup,
    "workload_heatmap": _metric_workload_heatmap,
}


class AnalyticsMetricView(APIView):
    """
    GET /workspaces/:slug/analytics/<metric>/

    Single entry point for all analytics metrics. All metric-specific
    params (project_id, days, period, sprint_id, limit) go as query params.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, metric):
        handler = METRICS.get(metric)
        if not handler:
            return Response(
                {"error": f"Unknown metric '{metric}'.", "available": sorted(METRICS)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        workspace = get_object_or_404(Workspace, slug=workspace_slug, members__user=request.user)
        return Response(handler(workspace, request.query_params))


# ── Report Builder ────────────────────────────────────────────────────────────

class ReportListCreateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug):
        workspace = get_object_or_404(Workspace, slug=workspace_slug, members__user=request.user)
        reports   = Report.objects.filter(workspace=workspace, owner=request.user).order_by("-updated_at")
        return Response(ReportSerializer(reports, many=True).data)

    def post(self, request, workspace_slug):
        workspace  = get_object_or_404(Workspace, slug=workspace_slug, members__user=request.user)
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save(workspace=workspace, owner=request.user)
        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _get(self, workspace_slug, report_id, user):
        workspace = get_object_or_404(Workspace, slug=workspace_slug, members__user=user)
        return get_object_or_404(Report, id=report_id, workspace=workspace)

    def get(self, request, workspace_slug, report_id):
        return Response(ReportSerializer(self._get(workspace_slug, report_id, request.user)).data)

    def patch(self, request, workspace_slug, report_id):
        report = self._get(workspace_slug, report_id, request.user)
        s = ReportSerializer(report, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        return Response(ReportSerializer(s.save()).data)

    def delete(self, request, workspace_slug, report_id):
        self._get(workspace_slug, report_id, request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportDataView(APIView):
    """Execute a saved report config and return chart-ready data."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, workspace_slug, report_id):
        workspace = get_object_or_404(Workspace, slug=workspace_slug, members__user=request.user)
        report    = get_object_or_404(Report, id=report_id, workspace=workspace)
        cfg       = report.config or {}
        source    = cfg.get("data_source", "tasks")
        fn        = _REPORT_DATA_SOURCES.get(source)
        if not fn:
            return Response({"error": f"Unknown data source: {source}"}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"data": fn(workspace, cfg), "config": cfg})
