import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useAPIKeys(workspaceSlug) {
  return useQuery({
    queryKey: ["api-keys", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/api-keys/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useCreateAPIKey(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceSlug}/api-keys/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", workspaceSlug] }),
  });
}

export function useRevokeAPIKey(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (keyId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/api-keys/${keyId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys", workspaceSlug] }),
  });
}
