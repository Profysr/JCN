import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const key = (ws, proj) => ["saved-views", ws, proj];

export const useSavedViews = (workspaceId, boardId) =>
  useQuery({
    queryKey: key(workspaceId, boardId),
    queryFn: () => api.get(`/api/workspaces/${workspaceId}/boards/${boardId}/saved-views/`).then(r => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity, // only changes via create/delete — both already invalidate this key
  });

export const useCreateSavedView = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceId}/boards/${boardId}/saved-views/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceId, boardId) }),
  });
};

export const useDeleteSavedView = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (viewId) => api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/saved-views/${viewId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceId, boardId) }),
  });
};
