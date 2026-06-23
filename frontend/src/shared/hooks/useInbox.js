import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { SOCKET_BACKED } from "@/shared/lib/queryClient";

const inboxKey = (workspaceId, tab, eventType, limit) =>
  ["inbox", workspaceId, tab, eventType, limit].filter(Boolean);

export function useInbox(
  workspaceId,
  { tab = "for_you", eventType, limit = 20, enabled = true } = {},
) {
  return useQuery({
    queryKey: inboxKey(workspaceId, tab, eventType, limit),
    queryFn: () =>
      api
        .get("/api/inbox/", {
          params: {
            workspace: workspaceId,
            tab,
            limit,
            ...(eventType ? { event_type: eventType } : {}),
          },
        })
        .then((r) => r.data),
    enabled: enabled && !!workspaceId,
    staleTime: 30_000,
    // Invalidated by the workspace socket on notification.created — see SOCKET_BACKED
    ...SOCKET_BACKED,
  });
}

/**
 * Total unread count for the bell/nav badges.
 * Uses a dedicated lightweight endpoint so the full inbox list is NOT fetched
 * on load — that list loads lazily only when the notification panel opens.
 *
 * Fetched ONCE per session then kept fresh purely by events, never by polling:
 *   • created  → workspace socket (`notification.created`) increments in place
 *   • read     → useUpdateInboxItem / useBulkUpdateInbox invalidate this key
 * Hence `staleTime: Infinity` + focus/reconnect refetch disabled — the badge no
 * longer re-hits the backend on every window focus. Requires the workspace
 * socket to be mounted app-wide (AppLayout) so `notification.created` lands on
 * every page, not just the board.
 */
export function useInboxUnreadCount(workspaceId) {
  const { data } = useQuery({
    queryKey: ["inbox-unread-count", workspaceId],
    queryFn: () =>
      api
        .get("/api/inbox/unread-count/", {
          params: { workspace: workspaceId },
        })
        .then((r) => r.data.count),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return data ?? 0;
}

export function useUpdateInboxItem(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.patch(`/api/inbox/${id}/`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", workspaceId] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count", workspaceId] });
    },
  });
}

export function useBulkUpdateInbox(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post("/api/inbox/bulk/", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", workspaceId] });
      qc.invalidateQueries({ queryKey: ["inbox-unread-count", workspaceId] });
    },
  });
}

/** Snooze presets → ISO strings relative to now. */
export function snoozeUntil(preset) {
  const d = new Date();
  if (preset === "1h") {
    d.setHours(d.getHours() + 1);
  }
  if (preset === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  }
  if (preset === "next_week") {
    d.setDate(d.getDate() + 7);
    d.setHours(9, 0, 0, 0);
  }
  return d.toISOString();
}
