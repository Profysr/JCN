import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { presenceKey } from "@/shared/hooks/usePresence";
import { BACKEND_WS_URL } from "@/shared/lib/env";

// ─────────────────────────────────────────────────────────────────────────────
// Handler registry
//
// A single WebSocket connection is opened by useWorkspaceSocket (AppLayout).
// Other hooks (useBoardSocket, usePeopleSocket, etc.) register handlers here
// while they are mounted — including ones defined in other files, via the
// exported `registerSocketHandler`. Every incoming message is dispatched to
// ALL registered handlers so there is never more than one open socket per
// workspace, regardless of how many pages or panels are open.
// ─────────────────────────────────────────────────────────────────────────────
const _handlers = new Set();

function _register(fn) {
  _handlers.add(fn);
  return () => _handlers.delete(fn);
}

function _dispatch(type, payload, qc, workspaceId) {
  _handlers.forEach((fn) => fn(type, payload, qc, workspaceId));
}

/**
 * Registers a handler on the shared workspace socket from outside this file
 * (e.g. usePeopleSocket.js). Returns the unregister function — call it from a
 * useEffect cleanup. Does not open a new connection.
 */
export function registerSocketHandler(fn) {
  return _register(fn);
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
    // Prepend directly — eliminates a GET /inbox/ round-trip when the bell is open.
    // Falls back gracefully when the list isn't loaded yet (updater receives undefined).
    qc.setQueriesData(
      { queryKey: ["inbox", workspaceId] },
      (old) => {
        if (!old || !Array.isArray(old.results)) return old;
        if (old.results.some((item) => item.id === payload.id)) return old;
        return {
          ...old,
          count: (old.count || 0) + 1,
          results: [{ ...payload, status: "unread" }, ...old.results],
        };
      },
    );
  }

  if (
    type === "objective.created" ||
    type === "objective.updated" ||
    type === "objective.deleted"
  ) {
    qc.invalidateQueries({ queryKey: ["objectives", workspaceId] });
  }

  if (type === "presence.updated") {
    const { resource_type, resource_id, user, last_seen, action } = payload;
    const isLeave = action === "leave";

    // Patch the resource-specific list in-place — no GET round-trip.
    // The 90s refetchInterval on usePresence acts as the resync safety net.
    qc.setQueryData(
      presenceKey(workspaceId, resource_type, resource_id),
      (old) => {
        if (!old) return old;
        if (isLeave) return old.filter((p) => p.user.id !== user.id);
        const idx = old.findIndex((p) => p.user.id === user.id);
        if (idx === -1) return [...old, { user, resource_type, resource_id, last_seen }];
        return old.map((p) => (p.user.id === user.id ? { ...p, user, last_seen } : p));
      },
    );

    // Patch the workspace-wide "all" list the same way.
    qc.setQueryData(["presence", workspaceId, "all"], (old) => {
      if (!old) return old;
      const match = (p) =>
        p.user.id === user.id &&
        p.resource_type === resource_type &&
        String(p.resource_id) === String(resource_id);
      if (isLeave) return old.filter((p) => !match(p));
      const idx = old.findIndex(match);
      const entry = { user, resource_type, resource_id, last_seen };
      if (idx === -1) return [...old, entry];
      return old.map((p) => (match(p) ? { ...p, ...entry } : p));
    });
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

    // Auth via Sec-WebSocket-Protocol ["jwt", <token>] — the server echoes
    // "jwt" back on accept. Keeps the token out of URLs and proxy logs.
    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(
      `${BACKEND_WS_URL}/ws/workspaces/${workspaceId}/`,
      ["jwt", token],
    );
    wsRef.current = ws;

    ws.onopen = () => console.debug("[WS] connected to workspace", workspaceId);

    ws.onmessage = (e) => {
      const { type, payload } = JSON.parse(e.data);
      _dispatch(type, payload, qc, workspaceId);
    };

    ws.onerror = () =>
      console.warn("[WS] error — realtime updates unavailable");

    // 4401 = token missing/expired (refresh + reconnect), 4403 = not a member (don't retry)
    ws.onclose = (ev) =>
      console.debug("[WS] closed", ev.code, ev.reason);

    return () => ws.close();
  }, [workspaceId, qc]);

  return wsRef;
}
