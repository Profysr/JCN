import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

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
      api
        .get(`/api/workspaces/${workspaceId}/org/departments/`)
        .then((r) => r.data),
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
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/teams/`).then((r) => r.data),
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
export const useOrgChart = (workspaceId) =>
  useQuery({
    queryKey: chartKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/chart/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

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
