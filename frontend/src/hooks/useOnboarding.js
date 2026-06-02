import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (slug) => `/api/workspaces/${slug}/onboarding/`;

export function useOnboarding(workspaceSlug) {
  return useQuery({
    queryKey: ["onboarding", workspaceSlug],
    queryFn:  () => api.get(base(workspaceSlug)).then((r) => r.data),
    enabled:  !!workspaceSlug,
    staleTime: 30_000,
  });
}

export function useUpdateOnboarding(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch(base(workspaceSlug), data).then((r) => r.data),
    onSuccess:  (data) => qc.setQueryData(["onboarding", workspaceSlug], data),
  });
}

export function useWorkspaceTemplates(workspaceSlug) {
  return useQuery({
    queryKey: ["workspace-templates", workspaceSlug],
    queryFn:  () =>
      api.get(`/api/workspaces/${workspaceSlug}/templates/`).then((r) => r.data),
    enabled:  !!workspaceSlug,
    staleTime: Infinity,
  });
}

export function useApplyWorkspaceTemplate(workspaceSlug) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (template_key) =>
      api.post(`/api/workspaces/${workspaceSlug}/templates/apply/`, { template_key }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", workspaceSlug] }),
  });
}
