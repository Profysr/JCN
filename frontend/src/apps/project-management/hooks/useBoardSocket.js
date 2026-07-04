import { useEffect } from "react";
import { registerSocketHandler } from "@/shared/hooks/useWorkspaceSocket";

// ════════════════════════════════════════════════════════════════════════════
// Board-scoped events — tasks, comments, approvals, reactions, forms, wiki.
// Registered only while a board-scoped page (Kanban, Forms, Wiki, ...) is
// mounted. Reuses the single workspace socket opened by useWorkspaceSocket —
// see registerSocketHandler in shared/hooks/useWorkspaceSocket.js.
// ════════════════════════════════════════════════════════════════════════════
function handleBoardEvent(type, payload, qc, workspaceId) {
  if (type === "task.created") {
    qc.invalidateQueries({ queryKey: ["tasks", workspaceId, payload.board_id] });
    qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
  }

  if (type === "task.updated") {
    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, payload.board_id] },
      (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === payload.id ? { ...t, ...payload } : t));
      },
    );
    qc.setQueryData(
      ["task-detail", workspaceId, payload.board_id, payload.id],
      (old) => (old ? { ...old, ...payload } : old),
    );
    qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
  }

  if (type === "task.moved") {
    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, payload.board_id] },
      (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === payload.id ? { ...t, ...payload } : t));
      },
    );
    qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
  }

  if (type === "task.deleted") {
    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, payload.board_id] },
      (old) => old?.filter((t) => t.id !== payload.id),
    );
    qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
  }

  if (type === "comment.created") {
    const { board_id, task_id, comment, is_reply } = payload;

    // Direct cache insert — eliminates the GET /comments/ round-trip.
    // Mirrors useCreateComment.onSuccess exactly. De-duplicates to skip comments
    // the poster already inserted via their own mutation's onSuccess.
    qc.setQueryData(
      ["comments", workspaceId, board_id, task_id],
      (old) => {
        if (!old) return old;
        if (is_reply) {
          const alreadyExists = old.pages.some((p) =>
            p.results.some((c) => c.replies?.some((r) => r.id === comment.id)),
          );
          if (alreadyExists) return old;
          const pages = old.pages.map((page) => ({
            ...page,
            results: page.results.map((c) =>
              c.id === comment.parent_id
                ? { ...c, replies: [...(c.replies || []), comment] }
                : c,
            ),
          }));
          return { ...old, pages };
        }
        // Top-level comment
        const alreadyExists = old.pages.some((p) =>
          p.results.some((c) => c.id === comment.id),
        );
        if (alreadyExists) return old;
        // Append to last page — matches useCreateComment.onSuccess ordering
        const pages = [...old.pages];
        const last = pages[pages.length - 1];
        pages[pages.length - 1] = {
          ...last,
          results: [...last.results, comment],
        };
        return { ...old, pages };
      },
    );

    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, board_id] },
      (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === task_id
            ? { ...t, comment_count: (t.comment_count || 0) + 1 }
            : t,
        );
      },
    );
  }

  if (type === "comment.deleted") {
    qc.invalidateQueries({
      queryKey: ["comments", workspaceId, payload.board_id, payload.task_id],
    });
    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, payload.board_id] },
      (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === payload.task_id
            ? { ...t, comment_count: Math.max(0, (t.comment_count || 1) - 1) }
            : t,
        );
      },
    );
  }

  if (type === "approval.created" || type === "approval.updated") {
    const approvalsKey = ["approvals", workspaceId, payload.board_id, payload.task_id];

    // Patch the approvals list in-place so the detail panel updates without a round-trip.
    qc.setQueryData(approvalsKey, (old) => {
      if (!old) return old; // not cached yet — next mount will fetch
      if (type === "approval.created") return [...old, payload.approval];
      return old.map((a) => (a.id === payload.approval.id ? payload.approval : a));
    });

    // Patch only the affected task's approval badge counts — no full task-list refetch.
    qc.setQueryData(["tasks", workspaceId, payload.board_id], (old) => {
      if (!old) return old;
      const allApprovals = qc.getQueryData(approvalsKey) ?? [];
      const pendingCount = allApprovals.filter((a) =>
        ["pending", "changes_requested"].includes(a.status),
      ).length;
      const approvedCount = allApprovals.filter((a) => a.status === "approved").length;
      return old.map((task) =>
        task.id === payload.task_id
          ? { ...task, pending_approval_count: pendingCount, approved_approval_count: approvedCount }
          : task,
      );
    });
  }

  if (type === "reaction.updated") {
    qc.setQueryData(
      ["comments", workspaceId, payload.board_id, payload.task_id],
      (old) => {
        if (!old) return old;
        const pages = old.pages.map((page) => ({
          ...page,
          results: page.results.map((c) => {
            if (c.id === payload.comment_id)
              return { ...c, reactions: payload.reactions };
            if (c.replies?.some((r) => r.id === payload.comment_id)) {
              return {
                ...c,
                replies: c.replies.map((r) =>
                  r.id === payload.comment_id
                    ? { ...r, reactions: payload.reactions }
                    : r,
                ),
              };
            }
            return c;
          }),
        }));
        return { ...old, pages };
      },
    );
  }

  // ── Forms ──────────────────────────────────────────────────────────────────
  if (type === "form.created") {
    const { board_id, ...form } = payload;
    qc.setQueryData(["form", workspaceId, board_id, form.id], form);
    qc.setQueryData(["forms", workspaceId, board_id], (old) => {
      if (!old) return old;
      if (old.some((f) => f.id === form.id)) return old;
      return [...old, form];
    });
  }

  if (type === "form.updated") {
    const { board_id, ...form } = payload;
    qc.setQueryData(["form", workspaceId, board_id, form.id], (old) =>
      old ? { ...old, ...form } : old,
    );
    qc.setQueryData(["forms", workspaceId, board_id], (old) =>
      old ? old.map((f) => (f.id === form.id ? { ...f, ...form } : f)) : old,
    );
  }

  if (type === "form.deleted") {
    qc.removeQueries({ queryKey: ["form", workspaceId, payload.board_id, payload.id] });
    qc.setQueryData(["forms", workspaceId, payload.board_id], (old) =>
      old ? old.filter((f) => f.id !== payload.id) : old,
    );
  }

  if (type === "form.submission_created" || type === "form.submission_updated") {
    const { board_id, form_id, submission } = payload;
    qc.setQueryData(
      ["form-submissions", workspaceId, board_id, form_id],
      (old) => {
        if (!old) return old;
        if (type === "form.submission_updated") {
          return old.map((s) => (s.id === submission.id ? submission : s));
        }
        if (old.some((s) => s.id === submission.id)) return old;
        return [submission, ...old];
      },
    );
    if (type === "form.submission_created") {
      qc.setQueryData(["form", workspaceId, board_id, form_id], (old) =>
        old ? { ...old, submission_count: (old.submission_count || 0) + 1 } : old,
      );
      qc.setQueryData(["forms", workspaceId, board_id], (old) =>
        old
          ? old.map((f) =>
              f.id === form_id
                ? { ...f, submission_count: (f.submission_count || 0) + 1 }
                : f,
            )
          : old,
      );
    }
  }

  // ── Wiki ───────────────────────────────────────────────────────────────────
  if (type === "wiki.created") {
    const { board_id, ...page } = payload;
    qc.setQueryData(["wiki-page", workspaceId, board_id, page.id], page);
    if (!page.parent) {
      qc.setQueryData(["wiki", workspaceId, board_id], (old) => {
        if (!old) return old;
        if (old.some((p) => p.id === page.id)) return old;
        return [...old, page];
      });
    }
  }

  if (type === "wiki.updated") {
    const { board_id, ...page } = payload;
    qc.setQueryData(["wiki-page", workspaceId, board_id, page.id], (old) =>
      old ? { ...old, ...page } : old,
    );
    if (!page.parent) {
      qc.setQueryData(["wiki", workspaceId, board_id], (old) =>
        old ? old.map((p) => (p.id === page.id ? { ...p, ...page } : p)) : old,
      );
    }
  }

  if (type === "wiki.deleted") {
    qc.removeQueries({
      queryKey: ["wiki-page", workspaceId, payload.board_id, payload.id],
    });
    qc.setQueryData(["wiki", workspaceId, payload.board_id], (old) =>
      old ? old.filter((p) => p.id !== payload.id) : old,
    );
    // The backend SET_NULLs children of the deleted page — they become root
    // pages and must appear in the list. A single background refetch is the
    // simplest safe way to reflect that reparenting.
    if (payload.parent_id === null) {
      qc.invalidateQueries({ queryKey: ["wiki", workspaceId, payload.board_id] });
    }
  }
}

/**
 * Registers board-level event handling while a board-scoped page is open
 * (Kanban, Forms, Wiki, ...). Does NOT open a new socket — reuses the single
 * connection opened by useWorkspaceSocket in AppLayout.
 */
export function useBoardSocket() {
  useEffect(() => registerSocketHandler(handleBoardEvent), []);
}
