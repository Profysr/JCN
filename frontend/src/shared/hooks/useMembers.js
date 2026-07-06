import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

const membersKey = (workspaceId) => ["workspace-members", workspaceId];

export const useMembers = (workspaceId) =>
  useQuery({
    queryKey: membersKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/members/`)
        .then((r) => r.data.results || r.data),
    enabled: !!workspaceId,
    staleTime: Infinity, // members only change via mutations — each one already invalidates this key
  });

const invitesKey = (workspaceId) => ["workspace-invites", workspaceId];

export const useInviteMember = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/invites/`, data)
        .then((r) => r.data),
    invitesKey(workspaceId),
  );

// Bulk invite: one request for the whole list, and we push the created invites straight into the pending-invites cache with setQueryData — no members refetch (inviting doesn't touch the member list) and no invites refetch.
export const useBulkInviteMembers = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ emails, role }) =>
      api
        .post(`/api/workspaces/${workspaceId}/invites/bulk/`, { emails, role })
        .then((r) => r.data),
    onSuccess: ({ invites }) => {
      if (!invites?.length) return;
      qc.setQueryData(invitesKey(workspaceId), (prev = []) => [
        ...invites,
        ...prev,
      ]);
    },
  });
};

export const useUpdateMemberRole = (workspaceId) =>
  useInvalidatingMutation(
    ({ memberId, role }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/members/${memberId}/`, {
          role,
        })
        .then((r) => r.data),
    membersKey(workspaceId),
  );

export const useRemoveMember = (workspaceId) =>
  useInvalidatingMutation(
    (memberId) =>
      api.delete(`/api/workspaces/${workspaceId}/members/${memberId}/`),
    membersKey(workspaceId),
  );

// Accepts an invite by token. Invalidates workspaces + member list on success.
// UI callbacks (navigate, setAccepted, setError) are passed at call-site via mutate's second arg.
export const useAcceptInvite = (token) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post(`/api/invites/${token}/accept/`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.invalidateQueries({ queryKey: ["workspace-members"] });
    },
  });
};

// Public invite lookup by token (used on the accept-invite landing page).
// `retry: false` so an invalid/expired token surfaces immediately.
export const useInviteDetails = (token) =>
  useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.get(`/api/invites/${token}/`).then((r) => r.data),
    enabled: !!token,
    staleTime: Infinity,
    retry: false,
  });

export const usePendingInvites = (workspaceId, { refetchInterval } = {}) =>
  useQuery({
    queryKey: invitesKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/invites/pending/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchInterval,
  });

export const useCancelInvite = (workspaceId) =>
  useInvalidatingMutation(
    (token) => api.delete(`/api/workspaces/${workspaceId}/invites/${token}/`),
    invitesKey(workspaceId),
  );
