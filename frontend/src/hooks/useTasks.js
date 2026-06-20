import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Query key factories ───────────────────────────────────────────────────────

const tasksKey = (workspaceId, boardId, filters = {}) => ["tasks", workspaceId, boardId, filters];
const detailKey = (ws, proj, taskId) => ["task-detail", ws, proj, taskId];
const subtasksKey = (ws, proj, taskId) => ["subtasks", ws, proj, taskId];
const commentsKey = (ws, proj, taskId) => ["comments", ws, proj, taskId];

// ── Filter builder ────────────────────────────────────────────────────────────

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

// ── Task list ─────────────────────────────────────────────────────────────────

export const useTasks = (workspaceId, boardId, filters = {}) => {
  const qs = buildTaskParams(filters);
  return useQuery({
    queryKey: tasksKey(workspaceId, boardId, filters),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${qs ? `?${qs}` : ""}`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
  });
};

// Full nested payload — used by task detail panel
export const useTaskDetail = (workspaceId, boardId, taskId) =>
  useQuery({
    queryKey: detailKey(workspaceId, boardId, taskId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`)
        .then((r) => r.data),
    enabled: !!taskId,
  });

export const useTaskSubtasks = (workspaceId, boardId, taskId) =>
  useQuery({
    queryKey: subtasksKey(workspaceId, boardId, taskId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/subtasks/`)
        .then((r) => r.data),
    enabled: !!taskId,
  });

export const useTaskComments = (workspaceId, boardId, taskId) =>
  useInfiniteQuery({
    queryKey: commentsKey(workspaceId, boardId, taskId),
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? pageParam  // full cursor URL from `next`
        : `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments/`;
      return api.get(url).then((r) => r.data);
    },
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: !!taskId,
  });

export const useTaskActivities = (workspaceId, boardId, taskId) =>
  useInfiniteQuery({
    queryKey: ["activities", workspaceId, boardId, taskId],
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? pageParam
        : `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/activities/`;
      return api.get(url).then((r) => r.data);
    },
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: !!taskId,
  });

// ── Task CRUD ─────────────────────────────────────────────────────────────────

export const useCreateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

// Used by board-level views (Kanban, Calendar, Gantt, Sprint) — refreshes the task list
export const useUpdateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["children", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

// Used by the task detail panel — also writes into the detail cache immediately
export const useUpdateTaskDetail = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`, data)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) => ({ ...old, ...updated }));
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

export const useDeleteTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId) =>
      api.delete(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

export const useMoveTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status_id, order }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/move/`, {
          status_id,
          order,
        })
        .then((r) => r.data),
    // Optimistic update — prefix-matched so it hits the 4-element key useTasks uses.
    onMutate: ({ taskId, status_id, order }) => {
      qc.cancelQueries({ queryKey: ["tasks", workspaceId, boardId] });
      const snapshots = qc.getQueriesData({ queryKey: ["tasks", workspaceId, boardId] });
      qc.setQueriesData(
        { queryKey: ["tasks", workspaceId, boardId] },
        (old) => old?.map((t) => (t.id === taskId ? { ...t, status_id, order } : t)),
      );
      return { snapshots };
    },
    onError: (_err, _, ctx) => {
      ctx.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (data) => {
      // Merge full server response — fixes partial optimistic state (status_id + order only)
      qc.setQueriesData(
        { queryKey: ["tasks", workspaceId, boardId] },
        (old) => Array.isArray(old) ? old.map((t) => (t.id === data.id ? { ...t, ...data } : t)) : old,
      );
      qc.setQueryData(
        detailKey(workspaceId, boardId, data.id),
        (old) => old ? { ...old, ...data } : old,
      );
      qc.setQueriesData(
        { queryKey: ["children", workspaceId, boardId], exact: false },
        (old) =>
          Array.isArray(old) ? old.map((c) => (c.id === data.id ? { ...c, ...data } : c)) : old,
      );
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

// ── Comments ──────────────────────────────────────────────────────────────────

export const useCreateComment = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, mentioned_user_ids = [], parent_id = null }) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments/`,
          { body, mentioned_user_ids, ...(parent_id ? { parent_id } : {}) },
        )
        .then((r) => r.data),
    onSuccess: (comment, { parent_id }) => {
      qc.setQueryData(commentsKey(workspaceId, boardId, taskId), (old) => {
        if (!old) return old;
        if (parent_id) {
          // Nest reply under its parent comment in the cache
          const pages = old.pages.map((page) => ({
            ...page,
            results: page.results.map((c) =>
              c.id === parent_id
                ? { ...c, replies: [...(c.replies || []), comment] }
                : c,
            ),
          }));
          return { ...old, pages };
        }
        // Top-level: append to last page
        const pages = [...old.pages];
        const last = pages[pages.length - 1];
        pages[pages.length - 1] = { ...last, results: [...last.results, comment] };
        return { ...old, pages };
      });
      // Only increment scalar for top-level comments
      if (!parent_id) {
        qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) =>
          old ? { ...old, comment_count: (old.comment_count || 0) + 1 } : old,
        );
      }
    },
  });
};

// mutate({ commentId, parentId? }) — parentId required when deleting a reply
export const useDeleteComment = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }) =>
      api.delete(
        `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments/${commentId}/`,
      ),
    onSuccess: (_, { commentId, parentId }) => {
      qc.setQueryData(commentsKey(workspaceId, boardId, taskId), (old) => {
        if (!old) return old;
        if (parentId) {
          const pages = old.pages.map((page) => ({
            ...page,
            results: page.results.map((c) =>
              c.id === parentId
                ? { ...c, replies: (c.replies || []).filter((r) => r.id !== commentId) }
                : c,
            ),
          }));
          return { ...old, pages };
        }
        const pages = old.pages.map((page) => ({
          ...page,
          results: page.results.filter((c) => c.id !== commentId),
        }));
        return { ...old, pages };
      });
      if (!parentId) {
        qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) =>
          old ? { ...old, comment_count: Math.max(0, (old.comment_count || 1) - 1) } : old,
        );
      }
    },
  });
};

// ── Subtasks ──────────────────────────────────────────────────────────────────

export const useCreateSubtask = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/subtasks/`,
          { title },
        )
        .then((r) => r.data),
    onSuccess: (subtask) => {
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), (old) =>
        old ? [...old, subtask] : [subtask],
      );
      qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) =>
        old ? { ...old, subtask_count: (old.subtask_count || 0) + 1 } : old,
      );
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
};

export const useToggleSubtask = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ subtaskId, is_done }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/subtasks/${subtaskId}/`,
          { is_done },
        )
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), (old) => {
        if (!old) return old;
        const next = old.map((s) => (s.id === updated.id ? updated : s));
        const done = next.filter((s) => s.is_done).length;
        qc.setQueryData(detailKey(workspaceId, boardId, taskId), (d) =>
          d ? { ...d, done_subtask_count: done } : d,
        );
        return next;
      });
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
};

export const useDeleteSubtask = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subtaskId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/subtasks/${subtaskId}/`,
      ),
    onSuccess: (_, subtaskId) => {
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), (old) =>
        old ? old.filter((s) => s.id !== subtaskId) : old,
      );
      qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) =>
        old ? { ...old, subtask_count: Math.max(0, (old.subtask_count || 1) - 1) } : old,
      );
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
    },
  });
};
