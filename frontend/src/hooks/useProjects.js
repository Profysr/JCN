import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export const useBoards = (workspaceId) =>
  useQuery({
    queryKey: ["boards", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/boards/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useBoard = (workspaceId, boardId) =>
  useQuery({
    queryKey: ["board", workspaceId, boardId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity,
    retry: false, // don't retry 403/404 — they won't change
  });

export const useCreateBoard = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["boards", workspaceId] });
      qc.invalidateQueries({ queryKey: ["portfolio", workspaceId] });
    },
  });
};

export const useUpdateBoard = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["portfolio", workspaceId] });
    },
  });
};

export const useDeleteBoard = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId) =>
      api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["portfolio", workspaceId] }),
  });
};
