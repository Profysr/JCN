import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const prefsKey = (workspaceSlug) => ["notification-prefs", workspaceSlug];

export function useNotificationPreferences(workspaceSlug) {
  return useQuery({
    queryKey: prefsKey(workspaceSlug),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/notification-preferences/`)
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 60_000,
  });
}

export function useSaveNotificationPreferences(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefs) =>
      api
        .put(`/api/workspaces/${workspaceSlug}/notification-preferences/`, prefs)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: prefsKey(workspaceSlug) });
    },
  });
}

export const DEFAULT_EVENT_TYPES = [
  { value: "assigned",  label: "Task assigned to me" },
  { value: "mentioned", label: "Mentioned in a comment" },
  { value: "commented", label: "Comment on my tasks" },
  { value: "approved",  label: "Approval requested" },
  { value: "automated", label: "Automation triggered" },
];
