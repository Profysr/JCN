import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

/** Fetch a single workspace by slug. Shared across pages/layout. */
export function useWorkspace(workspaceSlug) {
  return useQuery({
    queryKey: ["workspace", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/`).then((r) => r.data),
    enabled: !!workspaceSlug,
  });
}

/** List all workspaces the current user belongs to. */
export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () =>
      api.get("/api/workspaces/").then((r) => r.data.results || r.data),
    staleTime: 60_000,
  });
}

export const useUpdateWorkspace = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.patch(`/api/workspaces/${workspaceSlug}/`, data).then((r) => r.data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.setQueryData(["workspace", workspaceSlug], updated);
    },
  });
};

export const useDeleteWorkspace = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/api/workspaces/${workspaceSlug}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
};