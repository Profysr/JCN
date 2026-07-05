import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

const dashboardKey = (ws) => ["hr-dashboard", ws];

export const useHRDashboard = (workspaceId, { enabled = true } = {}) =>
  useQuery({
    queryKey: dashboardKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/dashboard/`).then((r) => r.data),
    enabled: !!workspaceId && enabled,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
