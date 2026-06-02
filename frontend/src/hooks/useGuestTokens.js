import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (ws, pid) =>
  `/api/workspaces/${ws}/projects/${pid}/guest-tokens/`;

export function useGuestTokens(workspaceSlug, projectId) {
  return useQuery({
    queryKey: ["guest-tokens", workspaceSlug, projectId],
    queryFn:  () => api.get(base(workspaceSlug, projectId)).then((r) => r.data),
    enabled:  !!workspaceSlug && !!projectId,
  });
}

export function useCreateGuestToken(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(base(workspaceSlug, projectId), data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["guest-tokens", workspaceSlug, projectId] }),
  });
}

export function useRevokeGuestToken(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId) =>
      api.delete(`${base(workspaceSlug, projectId)}${tokenId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["guest-tokens", workspaceSlug, projectId] }),
  });
}
