import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const sprintsKey  = (ws, proj) => ["sprints", ws, proj];
const burndownKey = (ws, proj, sprintId) => ["burndown", ws, proj, sprintId];

export const useSprints = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: sprintsKey(workspaceSlug, projectId),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/sprints/`).then(r => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useCreateSprint = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/sprints/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceSlug, projectId) }),
  });
};

export const useUpdateSprint = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/sprints/${sprintId}/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceSlug, projectId) }),
  });
};

export const useDeleteSprint = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId) => api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/sprints/${sprintId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceSlug, projectId) }),
  });
};

export const useSprintBurndown = (workspaceSlug, projectId, sprintId) =>
  useQuery({
    queryKey: burndownKey(workspaceSlug, projectId, sprintId),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/sprints/${sprintId}/burndown/`).then(r => r.data),
    enabled: !!sprintId,
    staleTime: 60_000,
  });
