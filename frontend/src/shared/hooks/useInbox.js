import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { SOCKET_BACKED } from "@/shared/lib/queryClient";

// Fixed positions (null, not omitted, for an unset segment) — the socket
// handler (useWorkspaceSocket.js) reads INBOX_KEY_APP_INDEX back out of a
// cached query's key to know which `app` it's scoped to. `.filter(Boolean)`
// would shift positions whenever `eventType` (or `app`) is unset, making that
// unrecoverable from the key alone.
export const INBOX_KEY_APP_INDEX = 5;
const inboxKey = (workspaceId, tab, eventType, limit, app) => [
  "inbox",
  workspaceId,
  tab,
  eventType ?? null,
  limit,
  app ?? null,
];

/**
 * `app` scopes the fetch to one product module's notifications (an
 * APP_REGISTRY key, e.g. "projects"/"people") via InboxItem.app — set on the
 * backend at creation from core.events.NOTIFICATION_VERBS, never inferred
 * client-side. Without it every app's notifications compete for the same
 * `limit`, so a quiet app's items can be pushed out of the page entirely by a
 * noisy one; passing `app` guarantees that app's own items are fetched.
 * Backend enforces the caller actually has access to that app — see
 * `_require_app_filter_access` in workspaces/views.py.
 */
export function useInbox(
  workspaceId,
  { tab = "for_you", eventType, limit = 20, app, enabled = true } = {},
) {
  return useQuery({
    queryKey: inboxKey(workspaceId, tab, eventType, limit, app),
    queryFn: () =>
      api
        .get("/api/inbox/", {
          params: {
            workspace: workspaceId,
            tab,
            limit,
            ...(eventType ? { event_type: eventType } : {}),
            ...(app ? { app } : {}),
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
 * Whether the user has any pending (unread) notification — for the bell/nav
 * dot. Uses a dedicated lightweight endpoint so the full inbox list is NOT
 * fetched on load — that list loads lazily only when the notification panel
 * opens. A plain boolean, not a count: the UI only ever renders a red dot,
 * never a number, so the backend doesn't need to compute one.
 *
 * Fetched ONCE per session then kept fresh purely by events, never by polling:
 *   • created  → workspace socket (`notification.created`) sets it to true
 *   • read     → useUpdateInboxItem / useBulkUpdateInbox invalidate this key
 * Hence `staleTime: Infinity` + focus/reconnect refetch disabled — the dot no
 * longer re-hits the backend on every window focus. Requires the workspace
 * socket to be mounted app-wide (AppLayout) so `notification.created` lands on
 * every page, not just the board.
 */
function useInboxUnreadCountQuery(workspaceId, app) {
  return useQuery({
    queryKey: ["inbox-unread-count", workspaceId, app].filter(Boolean),
    queryFn: () =>
      api
        .get("/api/inbox/unread-count/", {
          params: { workspace: workspaceId, ...(app ? { app } : {}) },
        })
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useHasUnreadNotifications(workspaceId, app) {
  const { data } = useInboxUnreadCountQuery(workspaceId, app);
  return data?.has_unread ?? false;
}

/**
 * Per-app unread flags ({ [appKey]: true }) for the AppSwitcher's per-app
 * dots — so a user notices a missed notification in an app they haven't
 * opened without ever opening the bell. Same queryKey/queryFn as
 * `useHasUnreadNotifications(workspaceId)` (no app arg) — React Query dedupes
 * them into one request/cache entry instead of firing a second network call.
 * An app missing from the object has no unread item — treat as falsy.
 */
export function useUnreadNotificationsByApp(workspaceId) {
  const { data } = useInboxUnreadCountQuery(workspaceId);
  return data?.by_app ?? {};
}

/**
 * Notification verb registry (label/icon/tone/app per verb) — fetched from
 * the backend instead of hardcoded, so core.events.NOTIFICATION_VERBS is the
 * single source of truth and a new verb never needs a matching frontend edit.
 * Static payload; cached indefinitely like usePermissions().
 */
export function useNotificationVerbMeta() {
  return useQuery({
    queryKey: ["notification-verb-meta"],
    queryFn: () => api.get("/api/notifications/verb-meta/").then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateInboxItem(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.patch(`/api/inbox/${id}/`, data).then((r) => r.data),
    onMutate: async ({ status }) => {
      if (status === "read") {
        const key = ["inbox-unread-count", workspaceId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData(key);
        // Optimistically clear the dot — this may be wrong if other unread
        // items remain, but the onSuccess invalidation below refetches the
        // true state moments later.
        qc.setQueryData(key, (c) => ({ ...c, has_unread: false }));
        return { prev };
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(["inbox-unread-count", workspaceId], context.prev);
      }
    },
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
    onMutate: async ({ action }) => {
      if (action === "read") {
        const key = ["inbox-unread-count", workspaceId];
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData(key);
        // Approximate — bulk mark-all-read only covers whatever's currently
        // visible (possibly one app's scope), but the exact remainder is
        // known moments later via the onSuccess invalidation below.
        qc.setQueryData(key, { has_unread: false, by_app: {} });
        return { prev };
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.prev !== undefined) {
        qc.setQueryData(["inbox-unread-count", workspaceId], context.prev);
      }
    },
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
