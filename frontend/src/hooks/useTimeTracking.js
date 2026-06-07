import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const timerBase = (ws) => `/api/workspaces/${ws}/timer`;
const entryBase = (ws, proj, tk) =>
  `/api/workspaces/${ws}/projects/${proj}/tasks/${tk}/time-entries/`;

// ── Active timer ──────────────────────────────────────────────────────────────

export function useActiveTimer(workspaceSlug) {
  return useQuery({
    queryKey: ["timer-active", workspaceSlug],
    queryFn: () =>
      api.get(`${timerBase(workspaceSlug)}/active/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    // No polling — elapsed time is computed client-side from start_at.
    // This query re-validates only when start/stop mutations invalidate the key.
    staleTime: Infinity,
  });
}

export function useStartTimer(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data = {}) =>
      api
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/timer/start/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timer-active", workspaceSlug] });
      qc.invalidateQueries({
        queryKey: ["time-entries", workspaceSlug, projectId, taskId],
      });
    },
  });
}

export function useStopTimer(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.patch(`${timerBase(workspaceSlug)}/stop/`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timer-active", workspaceSlug] });
    },
  });
}

// ── Time entries ──────────────────────────────────────────────────────────────

export function useTimeEntries(workspaceSlug, projectId, taskId) {
  return useQuery({
    queryKey: ["time-entries", workspaceSlug, projectId, taskId],
    queryFn: () =>
      api.get(entryBase(workspaceSlug, projectId, taskId)).then((r) => r.data),
    enabled: !!taskId,
  });
}

export function useAddTimeEntry(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(entryBase(workspaceSlug, projectId, taskId), data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["time-entries", workspaceSlug, projectId, taskId],
      }),
  });
}

export function useDeleteTimeEntry(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId) =>
      api.delete(`${entryBase(workspaceSlug, projectId, taskId)}${entryId}/`),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["time-entries", workspaceSlug, projectId, taskId],
      }),
  });
}

// ── Timesheets ────────────────────────────────────────────────────────────────

export function useTimesheet(workspaceSlug, week) {
  return useQuery({
    queryKey: ["timesheet", workspaceSlug, week],
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceSlug}/timesheets/${week ? `?week=${week}` : ""}`,
        )
        .then((r) => r.data),
    enabled: !!workspaceSlug,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatDuration(seconds) {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
