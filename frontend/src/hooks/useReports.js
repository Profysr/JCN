import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useReports(workspaceSlug) {
  return useQuery({
    queryKey: ["reports", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useReport(workspaceSlug, reportId) {
  return useQuery({
    queryKey: ["reports", workspaceSlug, reportId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/${reportId}/`).then((r) => r.data),
    enabled: !!(workspaceSlug && reportId),
    staleTime: 30_000,
  });
}

export function useReportData(workspaceSlug, reportId) {
  return useQuery({
    queryKey: ["reports", workspaceSlug, reportId, "data"],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/${reportId}/data/`).then((r) => r.data),
    enabled: !!(workspaceSlug && reportId),
    staleTime: 60_000,
  });
}

export function useCreateReport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceSlug}/reports/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", workspaceSlug] }),
  });
}

export function useUpdateReport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/reports/${reportId}/`, data).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["reports", workspaceSlug] });
      qc.invalidateQueries({ queryKey: ["reports", workspaceSlug, vars.reportId] });
    },
  });
}

export function useDeleteReport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/reports/${reportId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reports", workspaceSlug] }),
  });
}

export function useReportShare(workspaceSlug, reportId) {
  return useQuery({
    queryKey: ["reports", workspaceSlug, reportId, "share"],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/${reportId}/share/`).then((r) => r.data),
    enabled: !!(workspaceSlug && reportId),
    staleTime: Infinity,
    retry: false,
  });
}

export function useCreateReportShare(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/${reportId}/share/`).then((r) => r.data),
    onSuccess: (_, reportId) =>
      qc.invalidateQueries({ queryKey: ["reports", workspaceSlug, reportId, "share"] }),
  });
}

export function useDeleteReportShare(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/reports/${reportId}/share/`),
    onSuccess: (_, reportId) =>
      qc.invalidateQueries({ queryKey: ["reports", workspaceSlug, reportId, "share"] }),
  });
}

export function useScheduledReports(workspaceSlug, reportId) {
  return useQuery({
    queryKey: ["reports", workspaceSlug, reportId, "schedules"],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/reports/${reportId}/schedules/`).then((r) => r.data),
    enabled: !!(workspaceSlug && reportId),
  });
}

export function useCreateScheduledReport(workspaceSlug, reportId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/reports/${reportId}/schedules/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["reports", workspaceSlug, reportId, "schedules"] }),
  });
}
