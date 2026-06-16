import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const BASE = (ws, proj) =>
  `/api/workspaces/${ws}/boards/${proj}/statuses/`;

export function useCreateStatus(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(BASE(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] }),
  });
}

export function useUpdateStatus(workspaceId, boardId) {
  const qc = useQueryClient();
  const key = ["board", workspaceId, boardId];

  return useMutation({
    mutationFn: ({ statusId, ...data }) =>
      api.patch(`${BASE(workspaceId, boardId)}${statusId}/`, data).then((r) => r.data),

    onMutate: ({ statusId, is_done }) => {
      if (!is_done) return;
      // Optimistically clear any other done column so the UI snaps immediately
      qc.setQueryData(key, (prev) => {
        if (!prev?.statuses) return prev;
        return {
          ...prev,
          statuses: prev.statuses.map((s) =>
            s.id !== statusId && s.is_done ? { ...s, is_done: false } : s,
          ),
        };
      });
    },

    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteStatus(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statusId) =>
      api.delete(`${BASE(workspaceId, boardId)}${statusId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] }),
  });
}

export function useReorderStatuses(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids) =>
      api.post(`${BASE(workspaceId, boardId)}reorder/`, { ids }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] }),
  });
}

export function useBatchSaveStatuses(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statuses) =>
      api.put(`${BASE(workspaceId, boardId)}bulk/`, statuses).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] }),
  });
}
