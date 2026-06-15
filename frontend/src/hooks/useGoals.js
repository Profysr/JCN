import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const objectivesKey = (workspaceId, timePeriod) =>
  ["objectives", workspaceId, timePeriod].filter(Boolean);

// ── Objectives ────────────────────────────────────────────────────────────────
export function useObjectives(workspaceId, timePeriod) {
  return useQuery({
    queryKey: objectivesKey(workspaceId, timePeriod),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/objectives/`, {
          params:
            timePeriod && timePeriod !== "all"
              ? { time_period: timePeriod }
              : {},
        })
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

export function useCreateObjective(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/objectives/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

export function useUpdateObjective(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/objectives/${id}/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

export function useDeleteObjective(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      api.delete(`/api/workspaces/${workspaceId}/objectives/${id}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

// ── Key Results ───────────────────────────────────────────────────────────────

export function useCreateKeyResult(workspaceId, objectiveId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/objectives/${objectiveId}/key-results/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

export function useDeleteKeyResult(workspaceId, objectiveId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (krId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/objectives/${objectiveId}/key-results/${krId}/`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

export function useLinkTasks(workspaceId, objectiveId, krId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskIds) =>
      api
        .put(
          `/api/workspaces/${workspaceId}/objectives/${objectiveId}/key-results/${krId}/tasks/`,
          {
            task_ids: taskIds,
          },
        )
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["objectives", workspaceId] }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const CONFIDENCE_CONFIG = {
  on_track: {
    label: "On Track",
    color: "text-emerald-600",
    bg: "bg-emerald-500/10",
    dot: "bg-emerald-500",
  },
  at_risk: {
    label: "At Risk",
    color: "text-amber-600",
    bg: "bg-amber-500/10",
    dot: "bg-amber-500",
  },
  off_track: {
    label: "Off Track",
    color: "text-red-600",
    bg: "bg-red-500/10",
    dot: "bg-red-500",
  },
};

export const TIME_PERIODS = [
  { value: "all", label: "All" },
  { value: "q1", label: "Q1" },
  { value: "q2", label: "Q2" },
  { value: "q3", label: "Q3" },
  { value: "q4", label: "Q4" },
  { value: "annual", label: "Annual" },
];
