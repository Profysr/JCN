import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { SOCKET_BACKED } from "@/shared/lib/queryClient";

// Departments/teams/reporting-lines are paginated server-side (core.pagination.OrgListPagination).
// These lists back dropdowns and full-page grids that expect the complete set, so
// follow `next` until exhausted rather than surfacing only the first page.
async function fetchAllPages(url) {
  let results = [];
  let next = url;
  while (next) {
    const { data } = await api.get(next);
    results = results.concat(data.results);
    next = data.next;
  }
  return results;
}

// ── Key factories ─────────────────────────────────────────────────────────────
// Exported so useWorkspaceSocket.js can patch these caches directly from
// org.* WebSocket events — see the "Realtime" note on each section below.
export const deptsKey = (ws) => ["org-departments", ws];
export const deptMemKey = (ws, deptId) => ["org-dept-members", ws, deptId];
export const teamsKey = (ws) => ["org-teams", ws];
export const teamMemKey = (ws, teamId) => ["org-team-members", ws, teamId];
export const jobsKey = (ws) => ["org-job-titles", ws];
export const chartKey = (ws) => ["org-chart", ws];
export const profileKey = (ws, memberId) => ["org-profile", ws, memberId];
export const myProfileKey = (ws) => ["org-my-profile", ws];
export const pendingProfilesKey = (ws) => ["org-pending-profiles", ws];

// ── Departments ───────────────────────────────────────────────────────────────
// Realtime: org.department.created/updated/deleted and org.department_member.added/removed
// patch this cache directly from the socket (see handleWorkspaceEvent in
// useWorkspaceSocket.js) — staleTime is finite only as a resync safety net for
// missed events, not the primary freshness mechanism.
export const useDepartments = (workspaceId) =>
  useQuery({
    queryKey: deptsKey(workspaceId),
    queryFn: () =>
      fetchAllPages(`/api/workspaces/${workspaceId}/org/departments/`),
    enabled: !!workspaceId,
    ...SOCKET_BACKED,
  });

export const useCreateDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/departments/`, data)
        .then((r) => r.data),
    // Direct cache insert — no GET round-trip. The socket echo of
    // org.department.created that follows is a no-op (same id already present).
    onSuccess: (created) => {
      qc.setQueryData(deptsKey(workspaceId), (old) =>
        old ? [...old, created] : old,
      );
    },
  });
};

export const useUpdateDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deptId, ...data }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/org/departments/${deptId}/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(deptsKey(workspaceId), (old) =>
        old?.map((d) => (d.id === updated.id ? updated : d)),
      );
    },
  });
};

export const useDeleteDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deptId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/departments/${deptId}/`),
    onSuccess: (_data, deptId) => {
      qc.setQueryData(deptsKey(workspaceId), (old) =>
        old?.filter((d) => d.id !== deptId),
      );
    },
  });
};

export const useDepartmentMembers = (workspaceId, deptId) =>
  useQuery({
    queryKey: deptMemKey(workspaceId, deptId),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/org/departments/${deptId}/members/`,
        )
        .then((r) => r.data),
    enabled: !!workspaceId && !!deptId,
    ...SOCKET_BACKED,
  });

export const useAddDepartmentMember = (workspaceId, deptId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/org/departments/${deptId}/members/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(deptMemKey(workspaceId, deptId), (old) =>
        old ? [...old, created] : old,
      );
      qc.setQueryData(deptsKey(workspaceId), (old) =>
        old?.map((d) =>
          d.id === deptId ? { ...d, member_count: (d.member_count || 0) + 1 } : d,
        ),
      );
    },
  });
};

export const useRemoveDepartmentMember = (workspaceId, deptId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/org/departments/${deptId}/members/${membershipId}/`,
      ),
    onSuccess: (_data, membershipId) => {
      qc.setQueryData(deptMemKey(workspaceId, deptId), (old) =>
        old?.filter((m) => m.id !== membershipId),
      );
      qc.setQueryData(deptsKey(workspaceId), (old) =>
        old?.map((d) =>
          d.id === deptId
            ? { ...d, member_count: Math.max(0, (d.member_count || 1) - 1) }
            : d,
        ),
      );
    },
  });
};

// ── Teams ─────────────────────────────────────────────────────────────────────
// Realtime: mirrors departments — org.team.* / org.team_member.* patch this
// cache directly from the socket.
export const useTeams = (workspaceId) =>
  useQuery({
    queryKey: teamsKey(workspaceId),
    queryFn: () => fetchAllPages(`/api/workspaces/${workspaceId}/org/teams/`),
    enabled: !!workspaceId,
    ...SOCKET_BACKED,
  });

export const useCreateTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/teams/`, data)
        .then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(teamsKey(workspaceId), (old) =>
        old ? [...old, created] : old,
      );
    },
  });
};

export const useUpdateTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`, data)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(teamsKey(workspaceId), (old) =>
        old?.map((t) => (t.id === updated.id ? updated : t)),
      );
    },
  });
};

export const useDeleteTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`),
    onSuccess: (_data, teamId) => {
      qc.setQueryData(teamsKey(workspaceId), (old) =>
        old?.filter((t) => t.id !== teamId),
      );
    },
  });
};

export const useTeamMembers = (workspaceId, teamId) =>
  useQuery({
    queryKey: teamMemKey(workspaceId, teamId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!teamId,
    ...SOCKET_BACKED,
  });

export const useAddTeamMember = (workspaceId, teamId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(teamMemKey(workspaceId, teamId), (old) =>
        old ? [...old, created] : old,
      );
      qc.setQueryData(teamsKey(workspaceId), (old) =>
        old?.map((t) =>
          t.id === teamId ? { ...t, member_count: (t.member_count || 0) + 1 } : t,
        ),
      );
    },
  });
};

export const useRemoveTeamMember = (workspaceId, teamId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/org/teams/${teamId}/members/${membershipId}/`,
      ),
    onSuccess: (_data, membershipId) => {
      qc.setQueryData(teamMemKey(workspaceId, teamId), (old) =>
        old?.filter((m) => m.id !== membershipId),
      );
      qc.setQueryData(teamsKey(workspaceId), (old) =>
        old?.map((t) =>
          t.id === teamId
            ? { ...t, member_count: Math.max(0, (t.member_count || 1) - 1) }
            : t,
        ),
      );
    },
  });
};

// ── Job Titles ────────────────────────────────────────────────────────────────
// Realtime: org.job_title.created/updated/deleted patch this cache directly.
export const useJobTitles = (workspaceId) =>
  useQuery({
    queryKey: jobsKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/job-titles/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    ...SOCKET_BACKED,
  });

export const useCreateJobTitle = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/job-titles/`, data)
        .then((r) => r.data),
    onSuccess: (created) => {
      qc.setQueryData(jobsKey(workspaceId), (old) =>
        old ? [...old, created] : old,
      );
    },
  });
};

export const useUpdateJobTitle = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ titleId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/org/job-titles/${titleId}/`, data)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(jobsKey(workspaceId), (old) =>
        old?.map((j) => (j.id === updated.id ? updated : j)),
      );
    },
  });
};

export const useDeleteJobTitle = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (titleId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/job-titles/${titleId}/`),
    onSuccess: (_data, titleId) => {
      qc.setQueryData(jobsKey(workspaceId), (old) =>
        old?.filter((j) => j.id !== titleId),
      );
    },
  });
};

// ── Org Chart ─────────────────────────────────────────────────────────────────
// Lazy-loaded tree: the root call returns only members with no manager; each
// node carries has_reports/direct_reports_count so the UI knows whether to show
// an expand affordance, and fetchChartReports (below) fetches one level at a time on click.
// Realtime: org.reporting_line.* and org.profile.* invalidate this whole prefix
// (root + any fetched "reports"/"department"/"unassigned" sub-queries) — see
// useWorkspaceSocket.js. Note this does NOT reset OrgChartPage's local
// expand/childrenByNode state, so an already-expanded branch in another open
// tab can go stale until that node is collapsed/re-expanded or the page remounts.
export const useOrgChart = (workspaceId) =>
  useQuery({
    queryKey: chartKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/chart/`).then((r) => r.data),
    enabled: !!workspaceId,
    ...SOCKET_BACKED,
  });

// Expand-on-click fetchers — called imperatively (via queryClient.fetchQuery) from
// OrgChartPage rather than as hooks, since the number of expandable nodes/departments
// is dynamic and hook calls can't be looped per-node.
export const chartReportsKey = (ws, memberId) => [...chartKey(ws), "reports", memberId];
export const deptChartKey = (ws, deptId) => [...chartKey(ws), "department", deptId];
export const unassignedChartKey = (ws) => [...chartKey(ws), "unassigned"];

export const fetchChartReports = (workspaceId, memberId) =>
  api
    .get(`/api/workspaces/${workspaceId}/org/chart/${memberId}/reports/`)
    .then((r) => r.data);

export const fetchDepartmentChartMembers = (workspaceId, deptId) =>
  api
    .get(`/api/workspaces/${workspaceId}/org/departments/${deptId}/chart/`)
    .then((r) => r.data);

export const fetchUnassignedChartMembers = (workspaceId) =>
  api
    .get(`/api/workspaces/${workspaceId}/org/chart/unassigned/`)
    .then((r) => r.data);

// ── Org Profile ───────────────────────────────────────────────────────────────
export const useOrgProfile = (workspaceId, memberId) =>
  useQuery({
    queryKey: profileKey(workspaceId, memberId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/members/${memberId}/profile/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!memberId,
    staleTime: 2 * 60 * 1000,
  });

export const useUpdateOrgProfile = (workspaceId, memberId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/org/members/${memberId}/profile/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(profileKey(workspaceId, memberId), updated);
      qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    },
  });
};

// ── My Profile (self-service onboarding) ─────────────────────────────────────
export const useMyOrgProfile = (workspaceId, { enabled = true } = {}) =>
  useQuery({
    queryKey: myProfileKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/me/profile/`)
        .then((r) => r.data),
    enabled: !!workspaceId && enabled,
    ...SOCKET_BACKED,
  });

export const useUpdateMyOrgProfile = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .patch(`/api/workspaces/${workspaceId}/org/me/profile/`, data)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(myProfileKey(workspaceId), updated);
    },
  });
};

export const useSubmitMyOrgProfile = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .post(`/api/workspaces/${workspaceId}/org/me/profile/`)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(myProfileKey(workspaceId), updated);
    },
  });
};

// ── Pending Profiles (HR review queue) ───────────────────────────────────────
// Realtime: org.profile.submitted appends to this list (small, targeted patch);
// org.profile.approved is handled per-mutation below rather than via socket,
// since BulkApproveProfilesView's response has no per-profile payload to patch with.
export const usePendingProfiles = (workspaceId) =>
  useQuery({
    queryKey: pendingProfilesKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/profiles/pending/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60 * 1000,
  });

export const useApproveProfile = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileId) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/profiles/${profileId}/approve/`)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(pendingProfilesKey(workspaceId), (old) =>
        old?.filter((p) => p.id !== updated.id),
      );
      qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    },
  });
};

export const useBulkApproveProfiles = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (profileIds) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/profiles/bulk-approve/`, {
          profile_ids: profileIds,
        })
        .then((r) => r.data),
    // Response is just { approved: N } — no per-profile payload to patch with,
    // so this rarer bulk-admin action still pays for a refetch.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: pendingProfilesKey(workspaceId) });
      qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    },
  });
};

// ── Reporting Lines ───────────────────────────────────────────────────────────
export const useDeleteReportingLine = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/reporting-lines/${lineId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    },
  });
};
