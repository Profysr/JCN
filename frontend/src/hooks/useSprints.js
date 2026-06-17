import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const sprintsKey     = (ws, proj)           => ["sprints", ws, proj];
const sprintDetailKey = (ws, proj, sprintId) => ["sprint",  ws, proj, sprintId];
const burndownKey    = (ws, proj, sprintId)  => ["burndown", ws, proj, sprintId];

export const useSprints = (workspaceId, boardId) =>
  useQuery({
    queryKey: sprintsKey(workspaceId, boardId),
    queryFn: () => api.get(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/`).then(r => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity,
  });

export const useSprintDetail = (workspaceId, boardId, sprintId) =>
  useQuery({
    queryKey: sprintDetailKey(workspaceId, boardId, sprintId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/${sprintId}/`).then(r => r.data),
    enabled: !!workspaceId && !!boardId && !!sprintId,
    staleTime: 30_000,
  });

export const useCreateSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: sprintsKey(workspaceId, boardId) }),
  });
};

export const useUpdateSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sprintId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/${sprintId}/`, data).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: sprintsKey(workspaceId, boardId) });
      qc.invalidateQueries({ queryKey: sprintDetailKey(workspaceId, boardId, data.id) });
    },
  });
};

export const useDeleteSprint = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sprintId) =>
      api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/sprints/${sprintId}/`),
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
