import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { presenceKey } from "@/shared/hooks/usePresence";
import { BACKEND_WS_URL } from "@/shared/lib/env";

/**
 * Shared connection lifecycle for the workspace WebSocket.
 *
 * Both scopes connect to the SAME endpoint (`/ws/workspaces/:id/`) and the
 * backend pushes every event to every connection. The `handle` function (a
 * stable module-level function) decides which events that connection acts on,
 * so the workspace and board connections never double-process the same event.
 *
 * `handle(type, payload, qc, workspaceId)` — must be defined at module scope so
 * its reference is stable across renders (the effect intentionally omits it
 * from its dependency array).
 */
function useScopedWorkspaceSocket(workspaceId, handle) {
  const qc = useQueryClient();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${BACKEND_WS_URL}/ws/workspaces/${workspaceId}/?token=${token}`,
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data);
      handle(type, payload, qc, workspaceId);
    };

    ws.onerror = () =>
      console.warn("WebSocket error — realtime updates unavailable");

    return () => ws.close();
  }, [workspaceId, qc]);

  return wsRef;
}

// ════════════════════════════════════════════════════════════════════════════
// Workspace-scoped events — alive on EVERY page (mounted once in AppLayout).
// These do not depend on a board being open: notifications/inbox, goals, presence.
// ════════════════════════════════════════════════════════════════════════════
function handleWorkspaceEvent(type, payload, qc, workspaceId) {
  // ── Inbox: keep the bell badge + list fresh from anywhere in the app ──
  if (type === "notification.created") {
    qc.setQueryData(
      ["inbox-unread-count", workspaceId],
      (c) => (c ?? 0) + 1,
    );
    qc.invalidateQueries({ queryKey: ["inbox", workspaceId] });
  }

  // ── Objective (OKR) events ──
  if (
    type === "objective.created" ||
    type === "objective.updated" ||
    type === "objective.deleted"
  ) {
    qc.invalidateQueries({ queryKey: ["objectives", workspaceId] });
  }

  // ── Presence events ──
  if (type === "presence.updated") {
    const { resource_type, resource_id } = payload;
    qc.invalidateQueries({
      queryKey: presenceKey(workspaceId, resource_type, resource_id),
    });
    qc.invalidateQueries({ queryKey: ["presence", workspaceId, "all"] });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Board-scoped events — only mounted while a board is open (KanbanPage).
// Tasks, comments, approvals, typing, reactions all carry a board_id.
// ════════════════════════════════════════════════════════════════════════════
function handleBoardEvent(type, payload, qc, workspaceId) {
  // ── Task events ──
  // All use setQueriesData (prefix match) because useTasks stores data under a 4-element key ["tasks", workspaceId, boardId, filters]. setQueryData (exact match) would miss it and write to a ghost entry nobody reads.
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

  // ── Comment events — update the task detail cache ──
  if (type === "comment.created") {
    qc.setQueryData(
      ["task-detail", workspaceId, payload.board_id, payload.task_id],
      (old) => {
        if (!old) return old;
        const exists = old.comments?.find((c) => c.id === payload.comment.id);
        if (exists) return old;
        return {
          ...old,
          comments: [...(old.comments || []), payload.comment],
          comment_count: (old.comment_count || 0) + 1,
        };
      },
    );
  }

  if (type === "comment.deleted") {
    qc.setQueryData(
      ["task-detail", workspaceId, payload.board_id, payload.task_id],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          comments:
            old.comments?.filter((c) => c.id !== payload.comment_id) || [],
          comment_count: Math.max(0, (old.comment_count || 1) - 1),
        };
      },
    );
  }

  // ── Approval events ──
  if (type === "approval.created" || type === "approval.updated") {
    qc.invalidateQueries({
      queryKey: ["approvals", workspaceId, payload.board_id, payload.task_id],
    });
    qc.invalidateQueries({ queryKey: ["tasks", workspaceId, payload.board_id] });
  }

  // ── Typing indicators — disabled, not in use ──
  // if (type === "typing.update") {
  //   window.dispatchEvent(new CustomEvent("jcn:typing", { detail: payload }));
  // }

  // ── Comment reaction events ──
  if (type === "reaction.updated") {
    qc.setQueryData(
      ["task-detail", workspaceId, payload.board_id, payload.task_id],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          comments:
            old.comments?.map((c) =>
              c.id === payload.comment_id
                ? { ...c, reactions: payload.reactions }
                : c,
            ) || [],
        };
      },
    );
  }
}

/**
 * Workspace-wide realtime. Mount ONCE at the layout level (AppLayout) so
 * notification / goal / presence events stay live on every page.
 */
export function useWorkspaceSocket(workspaceId) {
  return useScopedWorkspaceSocket(workspaceId, handleWorkspaceEvent);
}

/**
 * Board-level realtime (tasks, comments, approvals, typing, reactions).
 * Mount on the board page (KanbanPage) — opens a second connection that lives
 * only while a board is open. Cheap: same endpoint, scoped handler.
 */
export function useBoardSocket(workspaceId) {
  return useScopedWorkspaceSocket(workspaceId, handleBoardEvent);
}
