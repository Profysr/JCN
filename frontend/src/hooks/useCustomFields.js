import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const fieldsKey  = (ws, proj) => ["fields",  ws, proj];
const valuesKey  = (ws, proj, taskId) => ["field-values", ws, proj, taskId];

export const useBoardFields = (workspaceId, boardId) =>
  useQuery({
    queryKey: fieldsKey(workspaceId, boardId),
    queryFn: () => api.get(`/api/workspaces/${workspaceId}/boards/${boardId}/fields/`).then(r => r.data),
    enabled: !!workspaceId && !!boardId,
  });

export const useCreateField = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceId}/boards/${boardId}/fields/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKey(workspaceId, boardId) }),
  });
};

export const useDeleteField = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId) => api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/fields/${fieldId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKey(workspaceId, boardId) }),
  });
};

export const useUpsertFieldValue = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ field_id, value }) =>
      api.post(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/field-values/`, { field_id, value }).then(r => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(["task-detail", workspaceId, boardId, taskId], (old) => {
        if (!old) return old;
        const existing = old.field_values?.find(fv => fv.field.id === updated.field.id);
        return {
          ...old,
          field_values: existing
            ? old.field_values.map(fv => fv.field.id === updated.field.id ? updated : fv)
            : [...(old.field_values || []), updated],
        };
      });
    },
  });
};
