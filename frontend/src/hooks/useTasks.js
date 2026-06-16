import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const tasksKey = (workspaceId, boardId, filters = {}) => [
  "tasks",
  workspaceId,
  boardId,
  filters,
];

function buildTaskParams(filters = {}) {
  const p = new URLSearchParams();
  if (filters.search) p.set("search", filters.search);
  if (filters.sprint) p.set("sprint", filters.sprint);
  if (filters.start) p.set("start", filters.start);
  if (filters.end) p.set("end", filters.end);
  (filters.priorities || []).forEach((v) => p.append("priority", v));
  (filters.assignees || []).forEach((v) => p.append("assignee", v));
  (filters.labels || []).forEach((v) => p.append("label", v));
  (filters.types || []).forEach((v) => p.append("type", v));
  (filters.due || []).forEach((v) => p.append("due", v));
  if (filters.pendingMyApproval) p.set("pending_approval", "true");
  return p.toString();
}

export const useTasks = (workspaceId, boardId, filters = {}) => {
  const qs = buildTaskParams(filters);
  return useQuery({
    queryKey: tasksKey(workspaceId, boardId, filters),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${qs ? `?${qs}` : ""}`,
        )
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
  });
};

export const useTask = (workspaceId, boardId, taskId) =>
  useQuery({
    queryKey: ["task", workspaceId, boardId, taskId],
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
        )
        .then((r) => r.data),
    enabled: !!taskId,
  });

export const useCreateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] }),
  });
};

export const useUpdateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...data }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["children", workspaceId, boardId] });
    },
  });
};

export const useMoveTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status_id, order }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/move/`,
          { status_id, order },
        )
        .then((r) => r.data),
    // Optimistic update — prefix-matched so it hits the 4-element key useTasks actually uses (["tasks", workspaceId, boardId, filters]). setQueryData uses exact-match and misses it.
    onMutate: ({ taskId, status_id, order }) => {
      qc.cancelQueries({ queryKey: ["tasks", workspaceId, boardId] });
      // Snapshot every matching cache entry so we can restore all of them on error.
      const snapshots = qc.getQueriesData({ queryKey: ["tasks", workspaceId, boardId] });
      qc.setQueriesData(
        { queryKey: ["tasks", workspaceId, boardId] },
        (old) =>
          old?.map((t) =>
            t.id === taskId
              ? { ...t, status_id, order, status_detail: { ...t.status_detail, id: status_id } }
              : t,
          ),
      );
      return { snapshots };
    },
    onError: (_err, _, ctx) => {
      // Roll back every snapshot individually (exact keys, so each entry is restored cleanly).
      ctx.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (data) => {
      // Server returned full TaskCardSerializer data — write it directly into
      // the children cache instead of invalidating (avoids an extra refetch).
      qc.setQueriesData(
        { queryKey: ["children", workspaceId, boardId], exact: false },
        (old) =>
          Array.isArray(old)
            ? old.map((c) => (c.id === data.id ? { ...c, ...data } : c))
            : old,
      );
    },
  });
};

export const useDeleteTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] }),
  });
};
