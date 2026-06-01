import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const key = (ws, proj) => ["saved-views", ws, proj];

export const useSavedViews = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: key(workspaceSlug, projectId),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/saved-views/`).then(r => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useCreateSavedView = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/saved-views/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceSlug, projectId) }),
  });
};

export const useDeleteSavedView = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId) => api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/saved-views/${viewId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceSlug, projectId) }),
  });
};
