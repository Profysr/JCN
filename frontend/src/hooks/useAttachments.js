import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const BASE = (ws, proj, task) =>
  `/api/workspaces/${ws}/projects/${proj}/tasks/${task}/attachments/`;

export function useAttachments(workspaceSlug, projectId, taskId) {
  return useQuery({
    queryKey: ["attachments", workspaceSlug, projectId, taskId],
    queryFn: () => api.get(BASE(workspaceSlug, projectId, taskId)).then((r) => r.data),
    enabled: !!taskId,
  });
}

export function useUploadAttachment(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file) => {
      const form = new FormData();
      form.append("file", file);
      return api
        .post(BASE(workspaceSlug, projectId, taskId), form, {
          headers: { "Content-Type": "multipart/form-data" },
        })
        .then((r) => r.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", workspaceSlug, projectId, taskId] });
    },
  });
}

export function useDeleteAttachment(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId) =>
      api.delete(`${BASE(workspaceSlug, projectId, taskId)}${attachmentId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", workspaceSlug, projectId, taskId] });
    },
  });
}
