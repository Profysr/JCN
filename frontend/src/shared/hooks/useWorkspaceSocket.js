import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { presenceKey } from "@/shared/hooks/usePresence";
import { BACKEND_WS_URL } from "@/shared/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Handler registry
//
// A single WebSocket connection is opened by useWorkspaceSocket (AppLayout).
// Other hooks (useBoardSocket, etc.) register handlers here while they are
// mounted. Every incoming message is dispatched to ALL registered handlers so
// there is never more than one open socket per workspace, regardless of how
// many pages or panels are open.
// ─────────────────────────────────────────────────────────────────────────────
const _handlers = new Set();

function _register(fn) {
  _handlers.add(fn);
  return () => _handlers.delete(fn);
}

function _dispatch(type, payload, qc, workspaceId) {
  _handlers.forEach((fn) => fn(type, payload, qc, workspaceId));
}

// ════════════════════════════════════════════════════════════════════════════
// Workspace-scoped events — notifications, OKRs, presence.
// Handled on every page because useWorkspaceSocket lives in AppLayout.
// ════════════════════════════════════════════════════════════════════════════
function handleWorkspaceEvent(type, payload, qc, workspaceId) {
  if (type === "notification.created") {
    qc.setQueryData(
      ["inbox-unread-count", workspaceId],
      (c) => (c ?? 0) + 1,
    );
    qc.invalidateQueries({ queryKey: ["inbox", workspaceId] });
  }

  if (
    type === "objective.created" ||
    type === "objective.updated" ||
    type === "objective.deleted"
  ) {
    qc.invalidateQueries({ queryKey: ["objectives", workspaceId] });
  }

  if (type === "presence.updated") {
    const { resource_type, resource_id } = payload;
    qc.invalidateQueries({
      queryKey: presenceKey(workspaceId, resource_type, resource_id),
    });
    qc.invalidateQueries({ queryKey: ["presence", workspaceId, "all"] });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Board-scoped events — tasks, comments, approvals, reactions.
// Registered only while KanbanPage (or any board view) is mounted.
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
    qc.invalidateQueries({
      queryKey: ["comments", workspaceId, payload.board_id, payload.task_id],
    });
    qc.setQueriesData(
      { queryKey: ["tasks", workspaceId, payload.board_id] },
      (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === payload.task_id
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
    qc.invalidateQueries({
      queryKey: ["approvals", workspaceId, payload.board_id, payload.task_id],
    });
    qc.invalidateQueries({ queryKey: ["tasks", workspaceId, payload.board_id] });
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
}

/**
 * Opens ONE WebSocket connection for the workspace and keeps it alive as long
 * as AppLayout is mounted (i.e. the entire session). All registered handlers
 * receive every message — no duplicate connections.
 *
 * Mount once in AppLayout.
 */
export function useWorkspaceSocket(workspaceId) {
  const qc = useQueryClient();
  const wsRef = useRef(null);

  // Register the workspace-level handler for the lifetime of this hook.
  useEffect(() => _register(handleWorkspaceEvent), []);

  // Open and maintain the single connection.
  useEffect(() => {
    if (!workspaceId) return;

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${BACKEND_WS_URL}/ws/workspaces/${workspaceId}/?token=${token}`,
    );
    wsRef.current = ws;

    ws.onopen = () => console.debug("[WS] connected to workspace", workspaceId);

    ws.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data);
      _dispatch(type, payload, qc, workspaceId);
    };

    ws.onerror = () =>
      console.warn("[WS] error — realtime updates unavailable");

    ws.onclose = (ev) =>
      console.debug("[WS] closed", ev.code, ev.reason);

    return () => ws.close();
  }, [workspaceId, qc]);

  return wsRef;
}

/**
 * Registers board-level event handling while a board page is open.
 * Does NOT open a new socket — reuses the single connection from AppLayout.
 *
 * Mount in KanbanPage (or any board view).
 */
export function useBoardSocket() {
  useEffect(() => _register(handleBoardEvent), []);
}
