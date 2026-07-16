import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

// No WS event feeds this aggregate cross-workspace query, so we don't lean on staleTime-driven background refetches (they'd fire on every window focus).
// Data is fetched once and only refreshed when the user hits the refresh button on MyWorkPage (see refetch()).
export const useMyWork = () =>
  useQuery({
    queryKey: ["my-work"],
    queryFn: () => api.get("/api/my-work/").then((r) => r.data),
    staleTime: Infinity,
    refetchOnWindowFocus: true,
  });

export const usePortfolio = (workspaceId) =>
  useQuery({
    queryKey: ["portfolio", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/portfolio/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 90_000,
  });
