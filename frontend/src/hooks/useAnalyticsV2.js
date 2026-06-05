import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

const STALE = 60_000; // 1 min

export function useVelocity(workspaceSlug, { projectId, limit = 8 } = {}) {
  return useQuery({
    queryKey: ["analytics", "velocity", workspaceSlug, projectId, limit],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/velocity/`, {
          params: { project_id: projectId, limit },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}

export function useCycleTime(workspaceSlug, { projectId, days = 90 } = {}) {
  return useQuery({
    queryKey: ["analytics", "cycle-time", workspaceSlug, projectId, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/cycle-time/`, {
          params: { project_id: projectId, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}

export function useLeadTime(workspaceSlug, { projectId, days = 90 } = {}) {
  return useQuery({
    queryKey: ["analytics", "lead-time", workspaceSlug, projectId, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/lead-time/`, {
          params: { project_id: projectId, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}

export function useThroughput(workspaceSlug, { projectId, period = "week", days = 90 } = {}) {
  return useQuery({
    queryKey: ["analytics", "throughput", workspaceSlug, projectId, period, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/throughput/`, {
          params: { project_id: projectId, period, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}

export function useCFD(workspaceSlug, { projectId, days = 30 } = {}) {
  return useQuery({
    queryKey: ["analytics", "cfd", workspaceSlug, projectId, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/cfd/`, {
          params: { project_id: projectId, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}

export function useBurnup(workspaceSlug, { sprintId, projectId, days = 30 } = {}) {
  return useQuery({
    queryKey: ["analytics", "burnup", workspaceSlug, sprintId, projectId, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/burnup/`, {
          params: { sprint_id: sprintId, project_id: projectId, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug && !!(sprintId || projectId),
    staleTime: STALE,
  });
}

export function useWorkloadHeatmap(workspaceSlug, { projectId, days = 14 } = {}) {
  return useQuery({
    queryKey: ["analytics", "workload-heatmap", workspaceSlug, projectId, days],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/analytics/workload-heatmap/`, {
          params: { project_id: projectId, days },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: STALE,
  });
}
