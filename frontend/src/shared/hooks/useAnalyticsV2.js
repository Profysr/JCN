import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

// Data never goes stale automatically — use the Refresh button in AnalyticsPage to invalidate all ["analytics", ...] queries and get fresh data on demand.
const STALE = Infinity;

async function metric(workspaceId, name, params = {}) {
  const r = await api.get(`/api/workspaces/${workspaceId}/analytics/${name}/`, { params });
  return r.data;
}

/**
 * Convert the Kanban-style filter state ({ search, priorities, assignees,
 * labels, types, due }) + a board id into the flat params the analytics
 * endpoints accept (multi-value → comma-separated). One source of truth so
 * every tab/chart/drill-down filters identically.
 */
export function buildTaskParams(filters = {}, boardId) {
  const p = {};
  if (boardId) p.board = boardId;
  if (filters.search) p.search = filters.search;
  if (filters.priorities?.length) p.priority = filters.priorities.join(",");
  if (filters.assignees?.length) p.assignee = filters.assignees.join(",");
  if (filters.types?.length) p.type = filters.types.join(",");
  if (filters.labels?.length) p.label = filters.labels.join(",");
  if (filters.due?.length) p.due = filters.due.join(",");
  return p;
}

// ── Headline KPI counts (summary view) ─────────────────────────────────────────
export function useWorkspaceSummary(workspaceId, { params = {} } = {}) {
  return useQuery({
    queryKey: ["analytics", "summary", workspaceId, params],
    queryFn: () => metric(workspaceId, "summary", params),
    enabled: !!workspaceId,
    staleTime: STALE,
  });
}

// ── Consolidated team workload (per-member rollup + heatmap) ────────────────────
export function useTeamWorkload(workspaceId, { days = 14, params = {}, pageUrl = null } = {}) {
  const query = { days, ...params };
  return useQuery({
    queryKey: ["analytics", "team", workspaceId, query, pageUrl],
    queryFn: () =>
      pageUrl
        ? api.get(pageUrl).then((r) => r.data)
        : api
            .get(`/api/workspaces/${workspaceId}/analytics/team/`, { params: query })
            .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: STALE,
  });
}

// ── Task drill-down — cursor-paginated infinite query ───────────────────────────
// Flat filter params: overdue=true, assignee=id, status=id1,id2, blocked=true, etc.
export function useTaskDrilldown(workspaceId, { params = {}, pageSize = 25, enabled = true } = {}) {
  const query = { page_size: pageSize, ...params };
  return useInfiniteQuery({
    queryKey: ["analytics", "tasks", workspaceId, query],
    queryFn: ({ pageParam }) =>
      pageParam
        ? api.get(pageParam).then((r) => r.data)
        : api
            .get(`/api/workspaces/${workspaceId}/analytics/tasks/`, { params: query })
            .then((r) => r.data),
    initialPageParam: null,
    getNextPageParam: (last) => last?.next || undefined,
    enabled: !!workspaceId && enabled,
    staleTime: STALE,
  });
}

// ── Universal dynamic aggregate hook (group-by counts) ─────────────────────────
// Accepts comma-separated group_by dims; response shape:
//   { summary: { total, open, done, overdue, blocked, stale }, groups: { [dim]: { results, ... } } }
// Flat filter params: board=uuid, status=id, priority=high, assignee=id, overdue=true, etc.
export function useAggregate(workspaceId, { params = {}, enabled = true } = {}) {
  const query = { metric: "count", ...params };
  return useQuery({
    queryKey: ["analytics", "aggregate", workspaceId, query],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/analytics/aggregate/`, { params: query })
        .then((r) => r.data),
    enabled: !!workspaceId && enabled,
    staleTime: STALE,
  });
}
