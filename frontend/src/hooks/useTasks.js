import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const tasksKey = (workspaceSlug, projectId) => ["tasks", workspaceSlug, projectId];

export const useTasks = (workspaceSlug, projectId) =>
  useQuery({
    queryKey: tasksKey(workspaceSlug, projectId),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/`).then((r) => r.data),
    enabled: !!workspaceSlug && !!projectId,
  });

export const useTask = (workspaceSlug, projectId, taskId) =>
  useQuery({
    queryKey: ["task", workspaceSlug, projectId, taskId],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/`).then((r) => r.data),
    enabled: !!taskId,
  });

export const useCreateTask = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey(workspaceSlug, projectId) }),
  });
};

export const useUpdateTask = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/`, data).then((r) => r.data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: tasksKey(workspaceSlug, projectId) });
      // Refresh any open parent-task panels that list this task as a child
      qc.invalidateQueries({ queryKey: ["children", workspaceSlug, projectId] });
    },
  });
};

export const useMoveTask = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status_id, order }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/move/`, { status_id, order }).then((r) => r.data),
    // Synchronous optimistic update — no await so @hello-pangea/dnd never sees the
    // original position again and the one-frame "snap back" flicker is eliminated.
    onMutate: ({ taskId, status_id, order }) => {
      qc.cancelQueries({ queryKey: tasksKey(workspaceSlug, projectId) });
      const prev = qc.getQueryData(tasksKey(workspaceSlug, projectId));
      qc.setQueryData(tasksKey(workspaceSlug, projectId), (old) =>
        old?.map((t) =>
          t.id === taskId
            ? { ...t, status_id, order, status_detail: { ...t.status_detail, id: status_id } }
            : t
        )
      );

      // Mirror the same optimistic patch into every open children cache so the
      // TaskDetailPanel status dot + label updates at the same instant as the card.
      qc.setQueriesData(
        { queryKey: ["children", workspaceSlug, projectId], exact: false },
        (old) =>
          Array.isArray(old)
            ? old.map((c) =>
                c.id === taskId
                  ? { ...c, status_detail: { ...c.status_detail, id: status_id } }
                  : c
              )
            : old
      );

      return { prev };
    },
    onError: (err, _, ctx) => {
      qc.setQueryData(tasksKey(workspaceSlug, projectId), ctx.prev);
      qc.invalidateQueries({ queryKey: ["children", workspaceSlug, projectId] });
      // v3.6.0 — surface approval gate error as a toast
      if (err?.response?.data?.approval_required) {
        import("@/components/ui/toast").then(({ toast }) => {
          if (toast?.error) toast.error("Resolve pending approvals before marking this task done.");
        }).catch(() => {});
      }
    },
    onSuccess: () => {
      // Server response has the full status_detail (name + color) — invalidate so
      // children panels get the accurate label, not just the optimistic id-only patch.
      qc.invalidateQueries({ queryKey: ["children", workspaceSlug, projectId] });
    },
  });
};

export const useDeleteTask = (workspaceSlug, projectId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId) => api.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKey(workspaceSlug, projectId) }),
  });
};
