import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const notesKey = (ws, memberId) => ["hr-employee-notes", ws, memberId];

export const useEmployeeNotes = (workspaceId, memberId) =>
  useQuery({
    queryKey: notesKey(workspaceId, memberId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/hr/members/${memberId}/notes/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!memberId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useCreateEmployeeNote = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/hr/members/${memberId}/notes/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(workspaceId, memberId) }),
  });
};

export const useUpdateEmployeeNote = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ noteId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/hr/members/${memberId}/notes/${noteId}/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(workspaceId, memberId) }),
  });
};

export const useDeleteEmployeeNote = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noteId) =>
      api.delete(`/api/workspaces/${workspaceId}/hr/members/${memberId}/notes/${noteId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: notesKey(workspaceId, memberId) }),
  });
};
