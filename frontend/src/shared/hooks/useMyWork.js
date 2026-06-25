import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

export const useMyWork = () =>
  useQuery({
    queryKey: ["my-work"],
    queryFn: () => api.get("/api/my-work/").then((r) => r.data),
    staleTime: 30_000,
  });

export const usePortfolio = (workspaceId) =>
  useQuery({
    queryKey: ["portfolio", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/portfolio/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 90_000,
  });
