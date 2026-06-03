import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const key = (slug) => ["dashboards", slug];

export const useDashboards = (workspaceSlug) =>
  useQuery({
    queryKey: key(workspaceSlug),
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/dashboards/`).then(r => r.data),
    enabled: !!workspaceSlug,
  });

export const useCreateDashboard = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(`/api/workspaces/${workspaceSlug}/dashboards/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceSlug) }),
  });
};

export const useUpdateDashboard = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dashboardId, ...data }) =>
      api.patch(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceSlug) }),
  });
};

export const useDeleteDashboard = (workspaceSlug) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dashboardId) => api.delete(`/api/workspaces/${workspaceSlug}/dashboards/${dashboardId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key(workspaceSlug) }),
  });
};
