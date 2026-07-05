import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

const apiKeysKey = (workspaceId) => ["api-keys", workspaceId];

export function useAPIKeys(workspaceId) {
  return useQuery({
    queryKey: apiKeysKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/api-keys/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });
}

export function useCreateAPIKey(workspaceId) {
  return useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/api-keys/`, data)
        .then((r) => r.data),
    apiKeysKey(workspaceId),
  );
}

export function useRevokeAPIKey(workspaceId) {
  return useInvalidatingMutation(
    (keyId) => api.delete(`/api/workspaces/${workspaceId}/api-keys/${keyId}/`),
    apiKeysKey(workspaceId),
  );
}

// Available scopes ([{ value, label, description }]) — derived on the backend
// from WorkspaceAPIKey.Scope, so the picker never hardcodes them. Static.
export function useAPIKeyScopes(workspaceId) {
  return useQuery({
    queryKey: ["api-key-scopes", workspaceId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/api-keys/scopes/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });
}
