import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const objectivesKey = (workspaceSlug, timePeriod) =>
  ["objectives", workspaceSlug, timePeriod].filter(Boolean);

// ── Objectives ────────────────────────────────────────────────────────────────

export function useObjectives(workspaceSlug, timePeriod) {
  return useQuery({
    queryKey: objectivesKey(workspaceSlug, timePeriod),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/objectives/`, {
          params: timePeriod && timePeriod !== "all" ? { time_period: timePeriod } : {},
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useCreateObjective(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceSlug}/objectives/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

export function useUpdateObjective(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/objectives/${id}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

export function useDeleteObjective(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) =>
      api.delete(`/api/workspaces/${workspaceSlug}/objectives/${id}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

// ── Key Results ───────────────────────────────────────────────────────────────

export function useCreateKeyResult(workspaceSlug, objectiveId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/objectives/${objectiveId}/key-results/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

export function useUpdateKeyResult(workspaceSlug, objectiveId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceSlug}/objectives/${objectiveId}/key-results/${id}/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

export function useDeleteKeyResult(workspaceSlug, objectiveId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (krId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/objectives/${objectiveId}/key-results/${krId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

export function useLinkTasks(workspaceSlug, objectiveId, krId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskIds) =>
      api
        .put(`/api/workspaces/${workspaceSlug}/objectives/${objectiveId}/key-results/${krId}/tasks/`, {
          task_ids: taskIds,
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["objectives", workspaceSlug] }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export const CONFIDENCE_CONFIG = {
  on_track:  { label: "On Track",  color: "text-emerald-600", bg: "bg-emerald-500/10", dot: "bg-emerald-500" },
  at_risk:   { label: "At Risk",   color: "text-amber-600",   bg: "bg-amber-500/10",   dot: "bg-amber-500"   },
  off_track: { label: "Off Track", color: "text-red-600",     bg: "bg-red-500/10",     dot: "bg-red-500"     },
};

export const TIME_PERIODS = [
  { value: "all", label: "All" },
  { value: "q1",  label: "Q1" },
  { value: "q2",  label: "Q2" },
  { value: "q3",  label: "Q3" },
  { value: "q4",  label: "Q4" },
  { value: "annual", label: "Annual" },
];
