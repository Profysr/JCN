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

