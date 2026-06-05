import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

// ── Status (all platforms) ────────────────────────────────────────────────────

export function useIntegrationStatus(workspaceSlug) {
  return useQuery({
    queryKey: ["integrations", workspaceSlug],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceSlug}/integrations/`).then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

// ── Slack ─────────────────────────────────────────────────────────────────────

export function useSlackChannels(workspaceSlug, { enabled = false } = {}) {
  return useQuery({
    queryKey: ["integrations", workspaceSlug, "slack-channels"],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/integrations/slack/channels/`)
        .then((r) => r.data.channels || []),
    enabled: !!(workspaceSlug && enabled),
    staleTime: 60_000,
  });
}

export function useDisconnectSlack(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.delete(`/api/workspaces/${workspaceSlug}/integrations/slack/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug] }),
  });
}

// Slack OAuth is a full-page redirect — no hook needed;
// the connect button opens a new tab or redirects to the backend URL.
export function slackOAuthUrl(workspaceSlug) {
  return `/api/integrations/slack/oauth/begin/?workspace_slug=${workspaceSlug}`;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export function useSaveTeams(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .put(`/api/workspaces/${workspaceSlug}/integrations/teams/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug] }),
  });
}

export function useDisconnectTeams(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.delete(`/api/workspaces/${workspaceSlug}/integrations/teams/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug] }),
  });
}

export function useTestTeams(workspaceSlug) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`/api/workspaces/${workspaceSlug}/integrations/teams/test/`)
        .then((r) => r.data),
  });
}

// ── Google Chat ───────────────────────────────────────────────────────────────

export function useSaveGoogleChat(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .put(`/api/workspaces/${workspaceSlug}/integrations/google-chat/`, data)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug] }),
  });
}

export function useDisconnectGoogleChat(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.delete(`/api/workspaces/${workspaceSlug}/integrations/google-chat/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug] }),
  });
}

export function useTestGoogleChat(workspaceSlug) {
  return useMutation({
    mutationFn: () =>
      api
        .post(`/api/workspaces/${workspaceSlug}/integrations/google-chat/test/`)
        .then((r) => r.data),
  });
}

// ── Channel mappings ──────────────────────────────────────────────────────────

export function useChannelMappings(workspaceSlug, { platform } = {}) {
  return useQuery({
    queryKey: ["integrations", workspaceSlug, "mappings", platform],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/integrations/mappings/`, {
          params: platform ? { platform } : {},
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useCreateChannelMapping(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceSlug}/integrations/mappings/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug, "mappings"] }),
  });
}

export function useUpdateChannelMapping(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mappingId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceSlug}/integrations/mappings/${mappingId}/`, data)
        .then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug, "mappings"] }),
  });
}

export function useDeleteChannelMapping(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mappingId) =>
      api.delete(`/api/workspaces/${workspaceSlug}/integrations/mappings/${mappingId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["integrations", workspaceSlug, "mappings"] }),
  });
}
