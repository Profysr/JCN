import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const docsKey = (ws, memberId) => ["hr-employee-docs", ws, memberId];

export const useEmployeeDocs = (workspaceId, memberId) =>
  useQuery({
    queryKey: docsKey(workspaceId, memberId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/hr/members/${memberId}/documents/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!memberId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

export const useUploadEmployeeDoc = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/hr/members/${memberId}/documents/`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        )
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey(workspaceId, memberId) }),
  });
};

export const useDeleteEmployeeDoc = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (docId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/hr/members/${memberId}/documents/${docId}/`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey(workspaceId, memberId) }),
  });
};
