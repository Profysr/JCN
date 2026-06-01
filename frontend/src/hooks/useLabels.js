import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const labelsKey = (workspaceSlug, projectId) => ["labels", workspaceSlug, projectId];

export const useLabels = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: labelsKey(workspaceSlug, projectId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/labels/`).then((r) => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useCreateLabel = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/labels/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelsKey(workspaceSlug, projectId) }),
  });
};

export const useDeleteLabel = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/labels/${labelId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelsKey(workspaceSlug, projectId) }),
  });
};
