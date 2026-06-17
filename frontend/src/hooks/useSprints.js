import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const sprintsKey  = (ws, proj) => ["sprints", ws, proj];
const burndownKey = (ws, proj, sprintId) => ["burndown", ws, proj, sprintId];

export const useSprints = (workspaceId, boardId) =>
  useQuery({
    queryKey: sprintsKey(workspaceId, boardId),
    queryFn: () => api.get(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/`).then(r => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity,
  });

export const useCreateSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceId, boardId) }),
  });
};

export const useUpdateSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/${sprintId}/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceId, boardId) }),
  });
};

export const useDeleteSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId) => api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/${sprintId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceId, boardId) }),
  });
};

export const useSprintBurndown = (workspaceId, boardId, sprintId) =>
  useQuery({
    queryKey: burndownKey(workspaceId, boardId, sprintId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/analytics/sprint_burndown/`, {
          params: { sprint_id: sprintId, board_id: boardId },
        })
        .then(r => r.data),
    enabled: !!sprintId,
    staleTime: 60_000,
  });
