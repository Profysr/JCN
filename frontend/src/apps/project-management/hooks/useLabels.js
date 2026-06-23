import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

const labelsKey = (workspaceId, boardId) => ["labels", workspaceId, boardId];

export const useLabels = (workspaceId, boardId) =>
  useQuery({
    queryKey: labelsKey(workspaceId, boardId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/labels/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity,
  });

export const useCreateLabel = (workspaceId, boardId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/${boardId}/labels/`, data)
        .then((r) => r.data),
    labelsKey(workspaceId, boardId),
  );

const useDeleteLabel = (workspaceId, boardId) =>
  useInvalidatingMutation(
    (labelId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/boards/${boardId}/labels/${labelId}/`,
      ),
    labelsKey(workspaceId, boardId),
  );
