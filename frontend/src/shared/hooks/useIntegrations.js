import { useQuery, useMutation } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

const integrationsKey = (workspaceId) => ["integrations", workspaceId];
const mappingsKey = (workspaceId) => ["integrations", workspaceId, "mappings"];

// ── Status (all platforms) ────────────────────────────────────────────────────

export function useIntegrationStatus(workspaceId) {
  return useQuery({
    queryKey: integrationsKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/integrations/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    retry: false,
  });
}

// Subscribable chat events ([{ value, label }]) — derived on the backend from
// core.events.EVENTS, so the picker can't drift from what actually delivers.
export function useIntegrationEvents(workspaceId) {
  return useQuery({
    queryKey: ["integration-events", workspaceId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/integrations/events/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });
}

// ── Teams ─────────────────────────────────────────────────────────────────────
export function useSaveTeams(workspaceId) {
  return useInvalidatingMutation(
    (data) =>
      api
        .put(`/api/workspaces/${workspaceId}/integrations/teams/`, data)
        .then((r) => r.data),
    integrationsKey(workspaceId),
  );
}

export function useDisconnectTeams(workspaceId) {
  return useInvalidatingMutation(
    () => api.delete(`/api/workspaces/${workspaceId}/integrations/teams/`),
    integrationsKey(workspaceId),
  );
}

export function useTestTeams(workspaceId) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`/api/workspaces/${workspaceId}/integrations/teams/test/`)
        .then((r) => r.data),
  });
}

// ── Google Chat ───────────────────────────────────────────────────────────────
export function useSaveGoogleChat(workspaceId) {
  return useInvalidatingMutation(
    (data) =>
      api
        .put(`/api/workspaces/${workspaceId}/integrations/google-chat/`, data)
        .then((r) => r.data),
    integrationsKey(workspaceId),
  );
}

export function useDisconnectGoogleChat(workspaceId) {
  return useInvalidatingMutation(
    () => api.delete(`/api/workspaces/${workspaceId}/integrations/google-chat/`),
    integrationsKey(workspaceId),
  );
}

export function useTestGoogleChat(workspaceId) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`/api/workspaces/${workspaceId}/integrations/google-chat/test/`)
        .then((r) => r.data),
  });
}

// ── Channel mappings ──────────────────────────────────────────────────────────
export function useChannelMappings(workspaceId, { platform } = {}) {
  return useQuery({
    queryKey: ["integrations", workspaceId, "mappings", platform],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/integrations/mappings/`, {
          params: platform ? { platform } : {},
        })
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });
}

export function useCreateChannelMapping(workspaceId) {
  return useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/integrations/mappings/`, data)
        .then((r) => r.data),
    mappingsKey(workspaceId),
  );
}

export function useUpdateChannelMapping(workspaceId) {
  return useInvalidatingMutation(
    ({ mappingId, ...data }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/integrations/mappings/${mappingId}/`,
          data,
        )
        .then((r) => r.data),
    mappingsKey(workspaceId),
  );
}

export function useDeleteChannelMapping(workspaceId) {
  return useInvalidatingMutation(
    (mappingId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/integrations/mappings/${mappingId}/`,
      ),
    mappingsKey(workspaceId),
  );
}
