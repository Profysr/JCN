import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (ws, pid) => `/api/workspaces/${ws}/projects/${pid}/boards/`;

export function useBoards(workspaceSlug, projectId) {
  return useQuery({
    queryKey: ["boards", workspaceSlug, projectId],
    queryFn:  () => api.get(base(workspaceSlug, projectId)).then((r) => r.data),
    enabled:  !!workspaceSlug && !!projectId,
  });
}

export function useBoardTemplates(workspaceSlug, projectId) {
  return useQuery({
    queryKey: ["board-templates", workspaceSlug, projectId],
    queryFn:  () =>
      api.get(`${base(workspaceSlug, projectId)}templates/`).then((r) => r.data),
    enabled:  !!workspaceSlug && !!projectId,
    staleTime: Infinity,
  });
}

export function useCreateBoard(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(base(workspaceSlug, projectId), data).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["boards", workspaceSlug, projectId] }),
  });
}

export function useUpdateBoard(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }) =>
      api.patch(`${base(workspaceSlug, projectId)}${boardId}/`, data).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["boards", workspaceSlug, projectId] }),
  });
}

export function useDeleteBoard(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId) => api.delete(`${base(workspaceSlug, projectId)}${boardId}/`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["boards", workspaceSlug, projectId] }),
  });
}

export function useArchiveBoard(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId) =>
      api.post(`${base(workspaceSlug, projectId)}${boardId}/archive/`).then((r) => r.data),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ["boards", workspaceSlug, projectId] }),
  });
}

export function useReorderBoards(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items) =>
      api.post(`${base(workspaceSlug, projectId)}reorder/`, items).then((r) => r.data),
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ["boards", workspaceSlug, projectId] });
      const prev = qc.getQueryData(["boards", workspaceSlug, projectId]);
      qc.setQueryData(["boards", workspaceSlug, projectId], (old = []) =>
        items.map(({ id, order }) => ({ ...old.find((b) => b.id === id), order }))
             .sort((a, b) => a.order - b.order)
      );
      return { prev };
    },
    onError: (_e, _v, ctx) =>
      qc.setQueryData(["boards", workspaceSlug, projectId], ctx.prev),
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["boards", workspaceSlug, projectId] }),
  });
}
