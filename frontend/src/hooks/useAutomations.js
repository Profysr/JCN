import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (ws, proj) => `/api/workspaces/${ws}/projects/${proj}/automations/`;

export function useAutomations(workspaceSlug, projectId) {
  return useQuery({
    queryKey: ["automations", workspaceSlug, projectId],
    queryFn: () => api.get(base(workspaceSlug, projectId)).then(r => r.data),
    enabled: !!projectId,
  });
}

export function useCreateAutomation(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(base(workspaceSlug, projectId), data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", workspaceSlug, projectId] }),
  });
}

export function useUpdateAutomation(workspaceSlug, projectId, ruleId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch(`${base(workspaceSlug, projectId)}${ruleId}/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", workspaceSlug, projectId] }),
  });
}

export function useDeleteAutomation(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId) => api.delete(`${base(workspaceSlug, projectId)}${ruleId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations", workspaceSlug, projectId] }),
  });
}

// export function useAutomationLogs(workspaceSlug, projectId, ruleId) {
//   return useQuery({
//     queryKey: ["automation-logs", workspaceSlug, projectId, ruleId],
//     queryFn: () => api.get(`${base(workspaceSlug, projectId)}${ruleId}/logs/`).then(r => r.data),
//     enabled: !!ruleId,
//   });
// }
