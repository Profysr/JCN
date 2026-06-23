import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const base = (ws, pid) => `/api/workspaces/${ws}/boards/${pid}/members/`;

export function useBoardMembers(workspaceId, boardId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["project-members", workspaceId, boardId],
    queryFn: () => api.get(base(workspaceId, boardId)).then((r) => r.data),
    enabled: enabled && !!workspaceId && !!boardId,
  });
}

function useAddBoardMember(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(base(workspaceId, boardId), data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["project-members", workspaceId, boardId],
      }),
  });
}

export function useUpdateBoardMember(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }) =>
      api
        .patch(`${base(workspaceId, boardId)}${memberId}/`, { role })
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["project-members", workspaceId, boardId],
      }),
  });
}

export function useRemoveBoardMember(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId) =>
      api.delete(`${base(workspaceId, boardId)}${memberId}/`),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["project-members", workspaceId, boardId],
      }),
  });
}

export function useBulkAddBoardMembers(workspaceId, boardId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (members) =>
      api
        .post(`${base(workspaceId, boardId)}bulk/`, { members })
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["project-members", workspaceId, boardId],
      }),
  });
}
