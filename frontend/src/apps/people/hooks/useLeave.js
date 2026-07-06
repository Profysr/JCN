import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useInvalidatingMutation } from "@/shared/hooks/useInvalidatingMutation";

// ── Key factories ─────────────────────────────────────────────────────────────
const policiesKey  = (ws)        => ["hr-leave-policies",  ws];
const requestsKey  = (ws, s)     => ["hr-leave-requests",  ws, s ?? "all"];
const balancesKey  = (ws)        => ["hr-leave-balances",  ws];
const whosOffKey   = (ws)        => ["hr-whos-off",        ws];
const holidaysKey  = (ws)        => ["hr-holidays",        ws];
const holidayCountriesKey = (ws) => ["hr-holiday-countries", ws];

// ── Leave Policies ────────────────────────────────────────────────────────────
export const useLeavePolicies = (workspaceId) =>
  useQuery({
    queryKey: policiesKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/leave-policies/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useCreateLeavePolicy = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api.post(`/api/workspaces/${workspaceId}/hr/leave-policies/`, data).then((r) => r.data),
    policiesKey(workspaceId),
  );

export const useUpdateLeavePolicy = (workspaceId) =>
  useInvalidatingMutation(
    ({ policyId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/hr/leave-policies/${policyId}/`, data).then((r) => r.data),
    policiesKey(workspaceId),
  );

export const useDeleteLeavePolicy = (workspaceId) =>
  useInvalidatingMutation(
    (policyId) =>
      api.delete(`/api/workspaces/${workspaceId}/hr/leave-policies/${policyId}/`),
    policiesKey(workspaceId),
  );

// ── Leave Requests ────────────────────────────────────────────────────────────
export const useLeaveRequests = (workspaceId, statusFilter) =>
  useQuery({
    queryKey: requestsKey(workspaceId, statusFilter),
    queryFn: () => {
      const params = statusFilter ? `?status=${statusFilter}` : "";
      return api.get(`/api/workspaces/${workspaceId}/hr/leave-requests/${params}`).then((r) => r.data);
    },
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

export const useCreateLeaveRequest = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api.post(`/api/workspaces/${workspaceId}/hr/leave-requests/`, data).then((r) => r.data),
    requestsKey(workspaceId),
    balancesKey(workspaceId),
    // Lets the getting-started checklist / guided tour detect completion.
    ["onboarding", workspaceId],
  );

export const useReviewLeaveRequest = (workspaceId) =>
  useInvalidatingMutation(
    ({ requestId, status, comment }) =>
      api
        .post(`/api/workspaces/${workspaceId}/hr/leave-requests/${requestId}/review/`, { status, comment })
        .then((r) => r.data),
    requestsKey(workspaceId),
    balancesKey(workspaceId),
  );

// ── Leave Balances ────────────────────────────────────────────────────────────
export const useLeaveBalances = (workspaceId) =>
  useQuery({
    queryKey: balancesKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/leave-balances/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

// ── Who's Off ─────────────────────────────────────────────────────────────────
export const useWhosOff = (workspaceId) =>
  useQuery({
    queryKey: whosOffKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/whos-off/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

// ── Holidays ──────────────────────────────────────────────────────────────────
export const useHolidays = (workspaceId) =>
  useQuery({
    queryKey: holidaysKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/holidays/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: 60_000,
  });

export const useCreateHoliday = (workspaceId) =>
  useInvalidatingMutation(
    (data) =>
      api.post(`/api/workspaces/${workspaceId}/hr/holidays/`, data).then((r) => r.data),
    holidaysKey(workspaceId),
  );

export const useUpdateHoliday = (workspaceId) =>
  useInvalidatingMutation(
    ({ holidayId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceId}/hr/holidays/${holidayId}/`, data).then((r) => r.data),
    holidaysKey(workspaceId),
  );

export const useDeleteHoliday = (workspaceId) =>
  useInvalidatingMutation(
    (holidayId) =>
      api.delete(`/api/workspaces/${workspaceId}/hr/holidays/${holidayId}/`),
    holidaysKey(workspaceId),
  );

export const useHolidayCountries = (workspaceId) =>
  useQuery({
    queryKey: holidayCountriesKey(workspaceId),
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/hr/holidays/countries/`).then((r) => r.data.results),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

// Fetched on demand (country/year picked by the user) rather than a useQuery.
export const useHolidaySuggestions = (workspaceId) =>
  useMutation({
    mutationFn: ({ country, year }) =>
      api
        .get(`/api/workspaces/${workspaceId}/hr/holidays/suggestions/?country=${country}&year=${year}`)
        .then((r) => r.data),
  });

export const useBulkCreateHolidays = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (holidays) =>
      api.post(`/api/workspaces/${workspaceId}/hr/holidays/bulk/`, { holidays }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: holidaysKey(workspaceId) }),
  });
};
