import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useWebhooks(workspaceSlug) {
  return useQuery({
    queryKey: ["webhooks", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/webhooks/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useCreateWebhook(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceSlug}/webhooks/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", workspaceSlug] }),
  });
}

export function useUpdateWebhook(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hookId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/webhooks/${hookId}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", workspaceSlug] }),
  });
}

export function useDeleteWebhook(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hookId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/webhooks/${hookId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhooks", workspaceSlug] }),
  });
}

export function useTestWebhook(workspaceSlug) {
  return useMutation({
    mutationFn: (hookId) =>
      api.post(`/api/workspaces/${workspaceSlug}/webhooks/${hookId}/test/`).then((r) => r.data),
  });
}

export function useWebhookDeliveries(workspaceSlug, hookId) {
  return useQuery({
    queryKey: ["webhooks", workspaceSlug, hookId, "deliveries"],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/webhooks/${hookId}/deliveries/`)
        .then((r) => r.data),
    enabled: !!(workspaceSlug && hookId),
    staleTime: 15_000,
  });
}
