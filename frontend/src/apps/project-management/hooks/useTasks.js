import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { SOCKET_BACKED } from "@/shared/lib/queryClient";
import { useToast } from "@/shared/components/ui/toast";

// ── Query key factories ───────────────────────────────────────────────────────

const tasksKey = (workspaceId, boardId, filters = {}) => [
  "tasks",
  workspaceId,
  boardId,
  filters,
];
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

export const useTasks = (workspaceId, boardId, filters = {}, options = {}) => {
  const qs = buildTaskParams(filters);
  const { enabled: optEnabled = true, ...restOptions } = options;
  return useQuery({
    queryKey: tasksKey(workspaceId, boardId, filters),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${qs ? `?${qs}` : ""}`,
        )
        .then((r) => r.data),
    enabled: optEnabled && !!workspaceId && !!boardId,
    // Live via board socket (task.created/updated/moved/deleted) — see SOCKET_BACKED
    ...SOCKET_BACKED,
    ...restOptions,
  });
};

// Full nested payload — used by task detail panel
export const useTaskDetail = (workspaceId, boardId, taskId) =>
  useQuery({
    queryKey: detailKey(workspaceId, boardId, taskId),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
        )
        .then((r) => r.data),
    enabled: !!taskId,
    // Live via board socket (task.updated, comment.*, reaction.updated)
    ...SOCKET_BACKED,
  });

export const useTaskSubtasks = (workspaceId, boardId, taskId) =>
  useQuery({
    queryKey: subtasksKey(workspaceId, boardId, taskId),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/subtasks/`,
        )
        .then((r) => r.data),
    enabled: !!taskId,
  });

export const useTaskComments = (workspaceId, boardId, taskId) =>
  useInfiniteQuery({
    queryKey: commentsKey(workspaceId, boardId, taskId),
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? pageParam
        : `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/comments/`;
      return api.get(url).then((r) => r.data);
    },
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: !!taskId,
    // Live via board socket (comment.created/deleted); focus refetch would also
    // reset the infinite scroll position, so disable it.
    ...SOCKET_BACKED,
  });

export const useTaskActivities = (workspaceId, boardId, taskId) =>
  useInfiniteQuery({
    queryKey: ["activities", workspaceId, boardId, taskId],
    queryFn: ({ pageParam }) => {
      const url = pageParam
        ? pageParam
        : `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/activity/`;
      return api.get(url).then((r) => r.data);
    },
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled: !!taskId,
    // Read-only feed, never invalidated (doc) — keep focus from resetting pages.
    ...SOCKET_BACKED,
  });

// ── Task CRUD ─────────────────────────────────────────────────────────────────

// Explicit useMutation (not useInvalidatingMutation) so we can attach onError.
export const useCreateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/`, data)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks", workspaceId, boardId] });
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
    onError: () => toast({ title: "Failed to create task", type: "error" }),
  });
};

// ── Cache-merge helpers ───────────────────────────────────────────────────────

const mergeTaskInLists = (qc, workspaceId, boardId, task) => {
  qc.setQueriesData({ queryKey: ["tasks", workspaceId, boardId] }, (old) =>
    Array.isArray(old)
      ? old.map((t) => (t.id === task.id ? { ...t, ...task } : t))
      : old,
  );
  qc.setQueriesData(
    { queryKey: ["children", workspaceId, boardId], exact: false },
    (old) =>
      Array.isArray(old)
        ? old.map((c) => (c.id === task.id ? { ...c, ...task } : c))
        : old,
  );
};

// Patches sprint task_count in-place: decrements the old sprint (if any) and
// increments the new one. Falls back to a full invalidation for status changes
// so the server can recompute sprint completion correctly.
const SPRINT_AFFECTING = ["status_id", "sprint_id"];

const maybeInvalidateSprint = (
  qc,
  workspaceId,
  boardId,
  changed,
  oldSprintId,
) => {
  if (!changed || !SPRINT_AFFECTING.some((k) => k in changed)) return;

  if ("sprint_id" in changed) {
    const newSprintId = changed.sprint_id;

    // Decrement old sprint count when the task is leaving it
    if (oldSprintId && oldSprintId !== newSprintId) {
      const dec = (n) => Math.max(0, (n || 1) - 1);
      qc.setQueryData(
        ["sprint", workspaceId, boardId, oldSprintId],
        (old) => (old ? { ...old, task_count: dec(old.task_count) } : old),
      );
      qc.setQueryData(["sprints", workspaceId, boardId], (old) =>
        Array.isArray(old)
          ? old.map((s) =>
              s.id === oldSprintId ? { ...s, task_count: dec(s.task_count) } : s,
            )
          : old,
      );
    }

    // Increment new sprint count when the task is entering one
    if (newSprintId) {
      qc.setQueryData(
        ["sprint", workspaceId, boardId, newSprintId],
        (old) =>
          old ? { ...old, task_count: (old.task_count || 0) + 1 } : old,
      );
      qc.setQueryData(["sprints", workspaceId, boardId], (old) =>
        Array.isArray(old)
          ? old.map((s) =>
              s.id === newSprintId
                ? { ...s, task_count: (s.task_count || 0) + 1 }
                : s,
            )
          : old,
      );
    }
    return;
  }

  // Status change — server recomputes sprint completion; refetch
  qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
};

// Used by board-level views (Kanban, Calendar, Gantt, Sprint)
export const useUpdateTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ taskId, ...data }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (updated, { taskId, ...data }) => {
      // Read the old sprint_id from the cache BEFORE overwriting it so the
      // sprint count delta (decrement old, increment new) is correct.
      const cached = qc
        .getQueriesData({ queryKey: ["tasks", workspaceId, boardId] })
        .flatMap(([, list]) => (Array.isArray(list) ? list : []))
        .find((t) => t.id === taskId);
      const oldSprintId = cached?.sprint_id ?? null;

      mergeTaskInLists(qc, workspaceId, boardId, { id: taskId, ...data, ...updated });
      qc.setQueryData(detailKey(workspaceId, boardId, updated.id), (old) =>
        old ? { ...old, ...updated } : old,
      );
      maybeInvalidateSprint(qc, workspaceId, boardId, data, oldSprintId);
    },
    onError: () => toast({ title: "Failed to update task", type: "error" }),
  });
};

// Used by the task detail panel — also writes into the detail cache immediately
export const useUpdateTaskDetail = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (updated, data) => {
      // Read old sprint_id BEFORE writing the new state.
      const oldSprintId =
        qc.getQueryData(detailKey(workspaceId, boardId, taskId))?.sprint_id ??
        null;

      qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) => ({
        ...old,
        ...updated,
      }));
      mergeTaskInLists(qc, workspaceId, boardId, { id: taskId, ...data, ...updated });
      maybeInvalidateSprint(qc, workspaceId, boardId, data, oldSprintId);
    },
    onError: () => toast({ title: "Failed to save changes", type: "error" }),
  });
};

export const useDeleteTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (taskId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/`,
      ),
    onSuccess: (_, taskId) => {
      qc.setQueriesData({ queryKey: ["tasks", workspaceId, boardId] }, (old) =>
        Array.isArray(old) ? old.filter((t) => t.id !== taskId) : old,
      );
      qc.removeQueries({ queryKey: detailKey(workspaceId, boardId, taskId) });
      // Deletion can change sprint completion — always refresh.
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
    onError: () => toast({ title: "Failed to delete task", type: "error" }),
  });
};

export const useMoveTask = (workspaceId, boardId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ taskId, status_id, order }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/move/`,
          { status_id, order },
        )
        .then((r) => r.data),
    // FIX: async so cancelQueries is awaited before the snapshot is taken,
    // preventing a race where an in-flight refetch overwrites the rollback data.
    onMutate: async ({ taskId, status_id, order }) => {
      // Snapshot + patch synchronously (before any await) so they batch with the
      // library's drag-state reset into one React render — prevents the drop flicker.
      // cancelQueries is awaited after to stop in-flight refetches from overwriting
      // the optimistic state.
      const snapshots = qc.getQueriesData({
        queryKey: ["tasks", workspaceId, boardId],
      });
      qc.setQueriesData({ queryKey: ["tasks", workspaceId, boardId] }, (old) =>
        old?.map((t) => (t.id === taskId ? { ...t, status_id, order } : t)),
      );
      await qc.cancelQueries({ queryKey: ["tasks", workspaceId, boardId] });
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
      toast({ title: "Failed to move task", type: "error" });
    },
    onSuccess: (data) => {
      // Merge full server response — fixes partial optimistic state
      qc.setQueriesData({ queryKey: ["tasks", workspaceId, boardId] }, (old) =>
        Array.isArray(old)
          ? old.map((t) => (t.id === data.id ? { ...t, ...data } : t))
          : old,
      );
      qc.setQueryData(detailKey(workspaceId, boardId, data.id), (old) =>
        old ? { ...old, ...data } : old,
      );
      qc.setQueriesData(
        { queryKey: ["children", workspaceId, boardId], exact: false },
        (old) =>
          Array.isArray(old)
            ? old.map((c) => (c.id === data.id ? { ...c, ...data } : c))
            : old,
      );
      qc.invalidateQueries({ queryKey: ["sprint", workspaceId, boardId] });
    },
  });
};

// ── Comments ──────────────────────────────────────────────────────────────────

export const useCreateComment = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
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
        // check if the reply already exists
        if (parent_id) {
          const alreadyExists = old.pages.some((p) =>
            p.results.some((c) => c.replies?.some((r) => r.id === comment.id)),
          );
          if (alreadyExists) return old;
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
        // Check if the comment already exists
        const alreadyExists = old.pages.some((p) =>
          p.results.some((c) => c.id === comment.id),
        );
        if (alreadyExists) return old;

        const pages = [...old.pages];
        const last = pages[pages.length - 1];
        pages[pages.length - 1] = {
          ...last,
          results: [...last.results, comment],
        };
        return { ...old, pages };
      });
      
      // Only increment scalar for top-level comments
      if (!parent_id) {
        qc.setQueryData(detailKey(workspaceId, boardId, taskId), (old) =>
          old ? { ...old, comment_count: (old.comment_count || 0) + 1 } : old,
        );
      }
    },
    onError: () => toast({ title: "Failed to send comment", type: "error" }),
  });
};

// mutate({ commentId, parentId? }) — parentId required when deleting a reply
export const useDeleteComment = (workspaceId, boardId, taskId) => {
  const qc = useQueryClient();
  const { toast } = useToast();
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
                ? {
                    ...c,
                    replies: (c.replies || []).filter((r) => r.id !== commentId),
                  }
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
          old
            ? { ...old, comment_count: Math.max(0, (old.comment_count || 1) - 1) }
            : old,
        );
      }
    },
    onError: () => toast({ title: "Failed to delete comment", type: "error" }),
  });
};

// ── Subtasks ──────────────────────────────────────────────────────────────────

// Patches subtask progress counts into the detail + every task-list variant from
// the authoritative subtasks array — no full task-list refetch per toggle.
const patchSubtaskCounts = (qc, workspaceId, boardId, taskId, subtasks) => {
  const subtask_count = subtasks.length;
  const done_subtask_count = subtasks.filter((s) => s.is_done).length;
  qc.setQueryData(detailKey(workspaceId, boardId, taskId), (d) =>
    d ? { ...d, subtask_count, done_subtask_count } : d,
  );
  qc.setQueriesData({ queryKey: ["tasks", workspaceId, boardId] }, (old) =>
    Array.isArray(old)
      ? old.map((t) =>
          t.id === taskId ? { ...t, subtask_count, done_subtask_count } : t,
        )
      : old,
  );
};

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
      const next = [
        ...(qc.getQueryData(subtasksKey(workspaceId, boardId, taskId)) || []),
        subtask,
      ];
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), next);
      patchSubtaskCounts(qc, workspaceId, boardId, taskId, next);
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
      const next = (
        qc.getQueryData(subtasksKey(workspaceId, boardId, taskId)) || []
      ).map((s) => (s.id === updated.id ? updated : s));
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), next);
      patchSubtaskCounts(qc, workspaceId, boardId, taskId, next);
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
      const next = (
        qc.getQueryData(subtasksKey(workspaceId, boardId, taskId)) || []
      ).filter((s) => s.id !== subtaskId);
      qc.setQueryData(subtasksKey(workspaceId, boardId, taskId), next);
      patchSubtaskCounts(qc, workspaceId, boardId, taskId, next);
    },
  });
};
