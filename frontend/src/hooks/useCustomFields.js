import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const fieldsKey  = (ws, proj) => ["fields",  ws, proj];
const valuesKey  = (ws, proj, taskId) => ["field-values", ws, proj, taskId];

export const useProjectFields = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: fieldsKey(workspaceSlug, projectId),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/fields/`).then(r => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useCreateField = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/fields/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKey(workspaceSlug, projectId) }),
  });
};

export const useDeleteField = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fieldId) => api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/fields/${fieldId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: fieldsKey(workspaceSlug, projectId) }),
  });
};

export const useUpsertFieldValue = (workspaceSlug, projectId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ field_id, value }) =>
      api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/field-values/`, { field_id, value }).then(r => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(["task-detail", workspaceSlug, projectId, taskId], (old) => {
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
