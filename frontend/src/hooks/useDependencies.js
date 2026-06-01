import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const BASE = (ws, proj, task) =>
  `/api/workspaces/${ws}/projects/${proj}/tasks/${task}/dependencies/`;

export function useDependencies(workspaceSlug, projectId, taskId) {
  return useQuery({
    queryKey: ["dependencies", workspaceSlug, projectId, taskId],
    queryFn: () => api.get(BASE(workspaceSlug, projectId, taskId)).then((r) => r.data),
    enabled: !!taskId,
  });
}

export function useAddDependency(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      api.post(BASE(workspaceSlug, projectId, taskId), payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", workspaceSlug, projectId, taskId] });
    },
  });
}

export function useRemoveDependency(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (depId) =>
      api.delete(`${BASE(workspaceSlug, projectId, taskId)}${depId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dependencies", workspaceSlug, projectId, taskId] });
    },
  });
}
