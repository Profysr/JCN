import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useImportSources(workspaceSlug) {
  return useQuery({
    queryKey: ["import", workspaceSlug, "sources"],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/import/sources/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: Infinity,
  });
}

export function useImportJobs(workspaceSlug) {
  return useQuery({
    queryKey: ["import", workspaceSlug, "jobs"],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/import/jobs/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 15_000,
  });
}

export function useImportJob(workspaceSlug, jobId) {
  return useQuery({
    queryKey: ["import", workspaceSlug, "jobs", jobId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/import/jobs/${jobId}/`)
        .then((r) => r.data),
    enabled: !!(workspaceSlug && jobId),
    refetchInterval: (data) =>
      data?.status === "importing" ? 2000 : false,
  });
}

/** Upload a file and get back job_id + preview + field_mapping */
export function useUploadImport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ source, file }) => {
      const fd = new FormData();
      fd.append("source", source);
      fd.append("file", file);
      return api
        .post(`/api/workspaces/${workspaceSlug}/import/jobs/`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import", workspaceSlug, "jobs"] }),
  });
}

/** Save updated field mapping */
export function useUpdateImportMapping(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, field_mapping }) =>
      api
        .patch(`/api/workspaces/${workspaceSlug}/import/jobs/${jobId}/`, { field_mapping })
        .then((r) => r.data),
    onSuccess: (_, { jobId }) =>
      qc.invalidateQueries({ queryKey: ["import", workspaceSlug, "jobs", jobId] }),
  });
}

/** Kick off the actual import */
export function useRunImport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/import/jobs/${jobId}/run/`)
        .then((r) => r.data),
    onSuccess: (_, jobId) =>
      qc.invalidateQueries({ queryKey: ["import", workspaceSlug, "jobs", jobId] }),
  });
}

/** Rollback an import within 24 h */
export function useRollbackImport(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId) =>
      api
        .delete(`/api/workspaces/${workspaceSlug}/import/jobs/${jobId}/rollback/`)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["import", workspaceSlug, "jobs"] }),
  });
}
