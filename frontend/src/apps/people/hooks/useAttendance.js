import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

// ── Key factories ─────────────────────────────────────────────────────────────
const policyKey   = (ws)           => ["hr-attendance-policy", ws];
const myKey       = (ws, from, to) => ["hr-attendance-my",     ws, from, to];
const listKey     = (ws, emp, from, to) => ["hr-attendance-list", ws, emp, from, to];
const summaryKey  = (ws, from, to) => ["hr-attendance-summary", ws, from, to];

// ── Attendance Policy ──────────────────────────────────────────────────────────
export const useAttendancePolicy = (workspaceId) =>
  useQuery({
    queryKey: policyKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/attendance-policy/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });

export const useUpdateAttendancePolicy = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.patch(`/api/workspaces/${workspaceId}/hr/attendance-policy/`, data).then((r) => r.data),
    onSuccess: (updated) => qc.setQueryData(policyKey(workspaceId), updated),
  });
};

// ── Clock In / Out ─────────────────────────────────────────────────────────────
export const useClockIn = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coords) =>
      api.post(`/api/workspaces/${workspaceId}/hr/attendance/clock-in/`, coords ?? {}).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-attendance-my", workspaceId] });
      qc.invalidateQueries({ queryKey: ["hr-attendance-list", workspaceId] });
      qc.invalidateQueries({ queryKey: ["hr-attendance-summary", workspaceId] });
    },
  });
};

export const useClockOut = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (coords) =>
      api.post(`/api/workspaces/${workspaceId}/hr/attendance/clock-out/`, coords ?? {}).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr-attendance-my", workspaceId] });
      qc.invalidateQueries({ queryKey: ["hr-attendance-list", workspaceId] });
      qc.invalidateQueries({ queryKey: ["hr-attendance-summary", workspaceId] });
    },
  });
};

// ── Geolocation helper ────────────────────────────────────────────────────────
// Resolves to { latitude, longitude } or {} if permission denied/unavailable —
// clock-in/out must never be blocked by a missing/refused location.
export function getGeolocation({ timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve({}),
      { timeout },
    );
  });
}

// ── My Attendance ──────────────────────────────────────────────────────────────
export const useMyAttendance = (workspaceId, dateFrom, dateTo) =>
  useQuery({
    queryKey: myKey(workspaceId, dateFrom, dateTo),
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to",   dateTo);
      return api
        .get(`/api/workspaces/${workspaceId}/hr/attendance/my/?${params}`)
        .then((r) => r.data);
    },
    enabled: !!workspaceId && !!dateFrom,
    staleTime: 30_000,
  });

// ── Admin: Attendance List ─────────────────────────────────────────────────────
export const useAttendanceList = (workspaceId, { employee, dateFrom, dateTo } = {}) =>
  useQuery({
    queryKey: listKey(workspaceId, employee, dateFrom, dateTo),
    queryFn: () => {
      const params = new URLSearchParams();
      if (employee) params.set("employee", employee);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to",   dateTo);
      return api
        .get(`/api/workspaces/${workspaceId}/hr/attendance/?${params}`)
        .then((r) => r.data);
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

// ── Admin: Summary ────────────────────────────────────────────────────────────
export const useAttendanceSummary = (workspaceId, dateFrom, dateTo) =>
  useQuery({
    queryKey: summaryKey(workspaceId, dateFrom, dateTo),
    queryFn: () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo)   params.set("date_to",   dateTo);
      return api
        .get(`/api/workspaces/${workspaceId}/hr/attendance/summary/?${params}`)
        .then((r) => r.data);
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
