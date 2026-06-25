import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

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

export const useCreateBoard = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/`, data)
        .then((r) => r.data),
    ["boards", workspaceId],
    ["portfolio", workspaceId],
  );

export const useUpdateBoard = (workspaceId, boardId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/`, data)
        .then((r) => r.data),
    ["board", workspaceId, boardId],
    ["portfolio", workspaceId],
  );

export const useDeleteBoard = (workspaceId) =>
  useInvalidatingMutation(
    (boardId) => api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/`),
    ["portfolio", workspaceId],
  );
