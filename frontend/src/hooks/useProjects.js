import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export const useProjects = (workspaceSlug) =>
  useQuery({
    queryKey: ["projects", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/projects/`).then((r) => r.data),
    enabled: !!workspaceSlug,
  });

export const useProject = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: ["project", workspaceSlug, projectId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/`)
        .then((r) => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useCreateProject = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/projects/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["projects", workspaceSlug] }),
  });
};

export const useUpdateProject = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", workspaceSlug] });
      qc.invalidateQueries({ queryKey: ["project", workspaceSlug, projectId] });
    },
  });
};

export const useDeleteProject = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["projects", workspaceSlug] }),
  });
};
