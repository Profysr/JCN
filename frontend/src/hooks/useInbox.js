import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export const inboxKey = (workspaceSlug, tab, eventType) =>
  ["inbox", workspaceSlug, tab, eventType].filter(Boolean);

export function useInbox(workspaceSlug, { tab = "for_you", eventType } = {}) {
  return useQuery({
    queryKey: inboxKey(workspaceSlug, tab, eventType),
    queryFn: () =>
      api
        .get("/api/inbox/", {
          params: {
            workspace: workspaceSlug,
            tab,
            ...(eventType ? { event_type: eventType } : {}),
          },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

/** Total unread count for the bell badge. */
export function useInboxUnreadCount(workspaceSlug) {
  const { data = [] } = useInbox(workspaceSlug, { tab: "for_you" });
  return data.filter((item) => item.status === "unread").length;
}

export function useUpdateInboxItem(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }) =>
      api.patch(`/api/inbox/${id}/`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", workspaceSlug] });
    },
  });
}

export function useBulkUpdateInbox(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post("/api/inbox/bulk/", data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox", workspaceSlug] });
    },
  });
}

/** Snooze presets → ISO strings relative to now. */
export function snoozeUntil(preset) {
  const d = new Date();
  if (preset === "1h")       { d.setHours(d.getHours() + 1); }
  if (preset === "tomorrow") { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
  if (preset === "next_week"){ d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); }
  return d.toISOString();
}
