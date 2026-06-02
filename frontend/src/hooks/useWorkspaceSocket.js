import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { notificationsKey } from "@/hooks/useNotifications";

export function useWorkspaceSocket(workspaceSlug) {
  const qc = useQueryClient();
  const wsRef = useRef(null);

  useEffect(() => {
    if (!workspaceSlug) return;

    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `ws://localhost:8000/ws/workspaces/${workspaceSlug}/?token=${token}`
    );
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data);

      // ── Task events ────────────────────────────────────────────
      if (type === "task.created") {
        qc.setQueryData(["tasks", workspaceSlug, payload.project_id], (old) => {
          if (!old) return [payload];
          return old.find((t) => t.id === payload.id) ? old : [...old, payload];
        });
      }

      if (type === "task.updated") {
        qc.setQueryData(["tasks", workspaceSlug, payload.project_id], (old) => {
          if (!old) return old;
          return old.map((t) => (t.id === payload.id ? payload : t));
        });
      }

      if (type === "task.moved") {
        // Merge server data but KEEP the optimistic `order` value already in the cache.
        // The server recalculates order server-side; our DnD position is already visually
        // correct. Using the server order would re-sort columns and cause a visible flicker.
        qc.setQueryData(["tasks", workspaceSlug, payload.project_id], (old) => {
          if (!old) return old;
          return old.map((t) =>
            t.id === payload.id
              ? { ...payload, order: t.order }   // preserve optimistic order
              : t
          );
        });
      }

      if (type === "task.deleted") {
        qc.setQueryData(["tasks", workspaceSlug, payload.project_id], (old) =>
          old?.filter((t) => t.id !== payload.id)
        );
      }

      // ── Comment events — update the task detail cache ──────────
      if (type === "comment.created") {
        qc.setQueryData(["task-detail", workspaceSlug, payload.project_id, payload.task_id], (old) => {
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
        qc.setQueryData(["task-detail", workspaceSlug, payload.project_id, payload.task_id], (old) => {
          if (!old) return old;
          return {
            ...old,
            comments: old.comments?.filter((c) => c.id !== payload.comment_id) || [],
            comment_count: Math.max(0, (old.comment_count || 1) - 1),
          };
        });
      }

      // ── Notification events (user-scoped, piggybacked on workspace WS) ──
      if (type === "notification.created") {
        qc.setQueryData(notificationsKey, (old) => {
          if (!old) return [payload];
          const exists = old.some((n) => n.id === payload.id);
          return exists ? old : [payload, ...old];
        });
      }
    };

    ws.onerror = () => console.warn("WebSocket error — realtime updates unavailable");

    return () => ws.close();
  }, [workspaceSlug, qc]);

  return wsRef;
}
