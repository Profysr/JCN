import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useBulkUpdateTasks(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/bulk/`, payload)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceSlug, projectId] });
    },
  });
}
