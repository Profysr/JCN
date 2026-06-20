import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { presenceKey } from "@/hooks/usePresence";
import { BACKEND_WS_URL } from "@/lib/env";

export function useWorkspaceSocket(workspaceId) {
  const qc = useQueryClient();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${BACKEND_WS_URL}/ws/workspaces/${workspaceId}/?token=${token}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data);

      // ── Task events ────────────────────────────────────────────
      // All use setQueriesData (prefix match) because useTasks stores data under a 4-element key ["tasks", workspaceId, boardId, filters]. setQueryData (exact match) would miss it and write to a ghost entry nobody reads.
      if (type === "task.created") {
        qc.invalidateQueries({ queryKey: ["tasks", workspaceId, payload.board_id] });
        qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
      }

      if (type === "task.updated") {
        qc.setQueriesData({ queryKey: ["tasks", workspaceId, payload.board_id] }, (old) => {
          if (!old) return old;
          return old.map((t) => (t.id === payload.id ? { ...t, ...payload } : t));
        });
        qc.setQueryData(["task-detail", workspaceId, payload.board_id, payload.id], (old) =>
          old ? { ...old, ...payload } : old,
        );
        qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
      }

      if (type === "task.moved") {
        qc.setQueriesData({ queryKey: ["tasks", workspaceId, payload.board_id] }, (old) => {
          if (!old) return old;
          return old.map((t) => (t.id === payload.id ? { ...t, ...payload } : t));
        });
        qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
      }

      if (type === "task.deleted") {
        qc.setQueriesData({ queryKey: ["tasks", workspaceId, payload.board_id] }, (old) =>
          old?.filter((t) => t.id !== payload.id)
        );
        qc.invalidateQueries({ queryKey: ["sprint", workspaceId, payload.board_id] });
      }

      // ── Comment events — update the task detail cache ──────────
      if (type === "comment.created") {
        qc.setQueryData(["task-detail", workspaceId, payload.board_id, payload.task_id], (old) => {
          if (!old) return old;
          const exists = old.comments?.find((c) => c.id === payload.comment.id);
          if (exists) return old;
          return {
            ...old,
            comments: [...(old.comments || []), payload.comment],
            comment_count: (old.comment_count || 0) + 1,
          };
        });
      }

      if (type === "comment.deleted") {
        qc.setQueryData(["task-detail", workspaceId, payload.board_id, payload.task_id], (old) => {
          if (!old) return old;
          return {
            ...old,
            comments: old.comments?.filter((c) => c.id !== payload.comment_id) || [],
            comment_count: Math.max(0, (old.comment_count || 1) - 1),
          };
        });
      }

      // ── Inbox: invalidate on new notification ──────────────────
      if (type === "notification.created") {
        qc.invalidateQueries({ queryKey: ["inbox", workspaceId] });
        qc.invalidateQueries({ queryKey: ["inbox-unread-count", workspaceId] });
      }

      // ── Approval events ────────────────────────────────────────
      if (type === "approval.created" || type === "approval.updated") {
        qc.invalidateQueries({
          queryKey: ["approvals", workspaceId, payload.board_id, payload.task_id],
        });
        qc.invalidateQueries({ queryKey: ["tasks", workspaceId, payload.board_id] });
      }

      // ── Typing indicators — forwarded to a custom event for TaskDetailPanel ──
      if (type === "typing.update") {
        window.dispatchEvent(new CustomEvent("jcn:typing", { detail: payload }));
      }

      // ── Presence events ────────────────────────────────────────
      if (type === "presence.updated") {
        const { resource_type, resource_id } = payload;
        qc.invalidateQueries({
          queryKey: presenceKey(workspaceId, resource_type, resource_id),
        });
        qc.invalidateQueries({ queryKey: ["presence", workspaceId, "all"] });
      }

      // ── Comment reaction events ────────────────────────────────
      if (type === "reaction.updated") {
        qc.setQueryData(
          ["task-detail", workspaceId, payload.board_id, payload.task_id],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              comments: old.comments?.map((c) =>
                c.id === payload.comment_id
                  ? { ...c, reactions: payload.reactions }
                  : c
              ) || [],
            };
          }
        );
      }
    };

    ws.onerror = () => console.warn("WebSocket error — realtime updates unavailable");

    return () => ws.close();
  }, [workspaceId, qc]);

  return wsRef;
}
