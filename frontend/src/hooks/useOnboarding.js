import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (workspaceId) => `/api/workspaces/${workspaceId}/onboarding/`;

export function useOnboarding(workspaceId) {
  return useQuery({
    queryKey: ["onboarding", workspaceId],
    queryFn:  () => api.get(base(workspaceId)).then((r) => r.data),
    enabled:  !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateOnboarding(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.patch(base(workspaceId), data).then((r) => r.data),
    onSuccess:  (data) => qc.setQueryData(["onboarding", workspaceId], data),
  });
}
