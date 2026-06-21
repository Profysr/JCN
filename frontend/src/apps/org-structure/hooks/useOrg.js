import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

// ── Key factories ─────────────────────────────────────────────────────────────
const deptsKey    = (ws)            => ["org-departments",   ws];
const deptMemKey  = (ws, deptId)    => ["org-dept-members",  ws, deptId];
const teamsKey    = (ws)            => ["org-teams",         ws];
const teamMemKey  = (ws, teamId)    => ["org-team-members",  ws, teamId];
const jobsKey     = (ws)            => ["org-job-titles",    ws];
const chartKey    = (ws)            => ["org-chart",         ws];

// ── Departments ───────────────────────────────────────────────────────────────
export const useDepartments = (workspaceId) =>
  useQuery({
    queryKey: deptsKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/departments/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useCreateDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/org/departments/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: deptsKey(workspaceId) }),
  });
};

export const useUpdateDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deptId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/org/departments/${deptId}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: deptsKey(workspaceId) }),
  });
};

export const useDeleteDepartment = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deptId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/departments/${deptId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: deptsKey(workspaceId) }),
  });
};

export const useDepartmentMembers = (workspaceId, deptId) =>
  useQuery({
    queryKey: deptMemKey(workspaceId, deptId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/departments/${deptId}/members/`).then((r) => r.data),
    enabled: !!workspaceId && !!deptId,
    staleTime: Infinity,
  });

export const useAddDepartmentMember = (workspaceId, deptId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/org/departments/${deptId}/members/`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deptMemKey(workspaceId, deptId) });
      qc.invalidateQueries({ queryKey: deptsKey(workspaceId) });
    },
  });
};

export const useRemoveDepartmentMember = (workspaceId, deptId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/departments/${deptId}/members/${membershipId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: deptMemKey(workspaceId, deptId) });
      qc.invalidateQueries({ queryKey: deptsKey(workspaceId) });
    },
  });
};

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

export const useCreateTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/org/teams/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
  });
};

export const useUpdateTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
  });
};

export const useDeleteTeam = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/teams/${teamId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamsKey(workspaceId) }),
  });
};

export const useTeamMembers = (workspaceId, teamId) =>
  useQuery({
    queryKey: teamMemKey(workspaceId, teamId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`).then((r) => r.data),
    enabled: !!workspaceId && !!teamId,
    staleTime: Infinity,
  });

export const useAddTeamMember = (workspaceId, teamId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/org/teams/${teamId}/members/`, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamMemKey(workspaceId, teamId) });
      qc.invalidateQueries({ queryKey: teamsKey(workspaceId) });
    },
  });
};

export const useRemoveTeamMember = (workspaceId, teamId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (membershipId) =>
      api.delete(`/api/workspaces/${workspaceId}/org/teams/${teamId}/members/${membershipId}/`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamMemKey(workspaceId, teamId) });
      qc.invalidateQueries({ queryKey: teamsKey(workspaceId) });
    },
  });
};

// ── Job Titles ────────────────────────────────────────────────────────────────
export const useJobTitles = (workspaceId) =>
  useQuery({
    queryKey: jobsKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/org/job-titles/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });

export const useCreateJobTitle = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post(`/api/workspaces/${workspaceId}/org/job-titles/`, data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: jobsKey(workspaceId) }),
  });
};

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
        .patch(`/api/workspaces/${workspaceId}/org/members/${memberId}/profile/`, data)
        .then((r) => r.data),
    onSuccess: (updated) => {
      qc.setQueryData(profileKey(workspaceId, memberId), updated);
      qc.invalidateQueries({ queryKey: chartKey(workspaceId) });
    },
  });
};
