import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useAnalytics(workspaceSlug) {
  return useQuery({
    queryKey: ["analytics", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/analytics/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 60_000,
  });
}
