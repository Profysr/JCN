import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const base = (ws, pid) =>
  `/api/workspaces/${ws}/projects/${pid}/members/`;

export function useProjectMembers(workspaceSlug, projectId) {
  return useQuery({
    queryKey: ["project-members", workspaceSlug, projectId],
    queryFn:  () => api.get(base(workspaceSlug, projectId)).then((r) => r.data),
    enabled:  !!workspaceSlug && !!projectId,
  });
}

export function useAddProjectMember(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post(base(workspaceSlug, projectId), data).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-members", workspaceSlug, projectId] }),
  });
}

export function useUpdateProjectMember(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }) =>
      api.patch(`${base(workspaceSlug, projectId)}${memberId}/`, { role }).then((r) => r.data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-members", workspaceSlug, projectId] }),
  });
}

export function useRemoveProjectMember(workspaceSlug, projectId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (memberId) =>
      api.delete(`${base(workspaceSlug, projectId)}${memberId}/`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["project-members", workspaceSlug, projectId] }),
  });
}
