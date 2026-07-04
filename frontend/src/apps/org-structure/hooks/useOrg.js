import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

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
const deptsKey = (ws) => ["org-departments", ws];
const deptMemKey = (ws, deptId) => ["org-dept-members", ws, deptId];
const teamsKey = (ws) => ["org-teams", ws];
const teamMemKey = (ws, teamId) => ["org-team-members", ws, teamId];
const jobsKey = (ws) => ["org-job-titles", ws];
const chartKey = (ws) => ["org-chart", ws];

// ── Departments ───────────────────────────────────────────────────────────────
export const useDepartments = (workspaceId) =>
  useQuery({
    queryKey: deptsKey(workspaceId),
    queryFn: () =>
      fetchAllPages(`/api/workspaces/${workspaceId}/org/departments/`),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useCreateDepartment = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/departments/`, data)
        .then((r) => r.data),
    deptsKey(workspaceId),
  );

export const useUpdateDepartment = (workspaceId) =>
  useInvalidatingMutation(
    ({ deptId, ...data }) =>
      api
        .patch(
          `/api/workspaces/${workspaceId}/org/departments/${deptId}/`,
          data,
        )
        .then((r) => r.data),
    deptsKey(workspaceId),
  );

export const useDeleteDepartment = (workspaceId) =>
  useInvalidatingMutation(
    (deptId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/departments/${deptId}/`),
    deptsKey(workspaceId),
  );

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
    staleTime: Infinity,
  });

export const useAddDepartmentMember = (workspaceId, deptId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/org/departments/${deptId}/members/`,
          data,
        )
        .then((r) => r.data),
    deptMemKey(workspaceId, deptId),
    deptsKey(workspaceId),
  );

export const useRemoveDepartmentMember = (workspaceId, deptId) =>
  useInvalidatingMutation(
    (membershipId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/org/departments/${deptId}/members/${membershipId}/`,
      ),
    deptMemKey(workspaceId, deptId),
    deptsKey(workspaceId),
  );

// ── Teams ─────────────────────────────────────────────────────────────────────
export const useTeams = (workspaceId) =>
  useQuery({
    queryKey: teamsKey(workspaceId),
    queryFn: () => fetchAllPages(`/api/workspaces/${workspaceId}/org/teams/`),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useCreateTeam = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/teams/`, data)
        .then((r) => r.data),
    teamsKey(workspaceId),
  );

export const useUpdateTeam = (workspaceId) =>
  useInvalidatingMutation(
    ({ teamId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`, data)
        .then((r) => r.data),
    teamsKey(workspaceId),
  );

export const useDeleteTeam = (workspaceId) =>
  useInvalidatingMutation(
    (teamId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`),
    teamsKey(workspaceId),
  );

export const useTeamMembers = (workspaceId, teamId) =>
  useQuery({
    queryKey: teamMemKey(workspaceId, teamId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!teamId,
    staleTime: Infinity,
  });

export const useAddTeamMember = (workspaceId, teamId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`,
          data,
        )
        .then((r) => r.data),
    teamMemKey(workspaceId, teamId),
    teamsKey(workspaceId),
  );

export const useRemoveTeamMember = (workspaceId, teamId) =>
  useInvalidatingMutation(
    (membershipId) =>
      api.delete(
        `/api/workspaces/${workspaceId}/org/teams/${teamId}/members/${membershipId}/`,
      ),
    teamMemKey(workspaceId, teamId),
    teamsKey(workspaceId),
  );

// ── Job Titles ────────────────────────────────────────────────────────────────
export const useJobTitles = (workspaceId) =>
  useQuery({
    queryKey: jobsKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/job-titles/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });

export const useCreateJobTitle = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/job-titles/`, data)
        .then((r) => r.data),
    jobsKey(workspaceId),
  );

export const useUpdateJobTitle = (workspaceId) =>
  useInvalidatingMutation(
    ({ titleId, ...data }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/org/job-titles/${titleId}/`, data)
        .then((r) => r.data),
    jobsKey(workspaceId),
  );

export const useDeleteJobTitle = (workspaceId) =>
  useInvalidatingMutation(
    (titleId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/job-titles/${titleId}/`),
    jobsKey(workspaceId),
  );

// ── Org Chart ─────────────────────────────────────────────────────────────────
// Lazy-loaded tree: the root call returns only members with no manager; each
// node carries has_reports/direct_reports_count so the UI knows whether to show
// an expand affordance, and fetchChartReports (below) fetches one level at a time on click.
export const useOrgChart = (workspaceId) =>
  useQuery({
    queryKey: chartKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/chart/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
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
const profileKey = (ws, memberId) => ["org-profile", ws, memberId];
const myProfileKey = (ws) => ["org-my-profile", ws];
const pendingProfilesKey = (ws) => ["org-pending-profiles", ws];

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
export const useMyOrgProfile = (workspaceId) =>
  useQuery({
    queryKey: myProfileKey(workspaceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/org/me/profile/`)
        .then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
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

export const useApproveProfile = (workspaceId) =>
  useInvalidatingMutation(
    (profileId) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/profiles/${profileId}/approve/`)
        .then((r) => r.data),
    pendingProfilesKey(workspaceId),
    chartKey(workspaceId),
  );

export const useBulkApproveProfiles = (workspaceId) =>
  useInvalidatingMutation(
    (profileIds) =>
      api
        .post(`/api/workspaces/${workspaceId}/org/profiles/bulk-approve/`, {
          profile_ids: profileIds,
        })
        .then((r) => r.data),
    pendingProfilesKey(workspaceId),
    chartKey(workspaceId),
  );

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
