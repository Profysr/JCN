import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export const useMyWork = () =>
  useQuery({
    queryKey: ["my-work"],
    queryFn: () => api.get("/api/my-work/").then(r => r.data),
    staleTime: 30_000,
  });

export const usePortfolio = (workspaceSlug) =>
  useQuery({
    queryKey: ["portfolio", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/portfolio/`).then(r => r.data),
    enabled: !!workspaceSlug,
    staleTime: 60_000,
  });
