import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const BASE = (ws, proj) => `/api/workspaces/${ws}/boards/${proj}/statuses/`;

const statusesKey = (workspaceId, boardId) => [
  "statuses",
  workspaceId,
  boardId,
];

export function useStatuses(workspaceId, boardId) {
  return useQuery({
    queryKey: statusesKey(workspaceId, boardId),
    queryFn: () => api.get(BASE(workspaceId, boardId)).then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

function useCreateStatus(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(BASE(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] }),
  });
}

export function useBatchSaveStatuses(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (statuses) =>
      api
        .put(`${BASE(workspaceId, boardId)}bulk/`, statuses)
        .then((r) => r.data),
    onSuccess: (data) =>
      qc.setQueryData(statusesKey(workspaceId, boardId), data),
  });
}
