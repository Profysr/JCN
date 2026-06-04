import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

function approvalsKey(workspaceSlug, projectId, taskId) {
  return ["approvals", workspaceSlug, projectId, taskId];
}

export function useApprovals(workspaceSlug, projectId, taskId) {
  return useQuery({
    queryKey: approvalsKey(workspaceSlug, projectId, taskId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/approvals/`)
        .then((r) => r.data),
    enabled: !!workspaceSlug && !!projectId && !!taskId,
  });
}

export function useRequestApproval(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/approvals/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: approvalsKey(workspaceSlug, projectId, taskId) });
    },
  });
}

export function useResubmitApproval(workspaceSlug, projectId, taskId, approvalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/approvals/${approvalId}/resubmit/`,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: approvalsKey(workspaceSlug, projectId, taskId) });
    },
  });
}

export function useSubmitReview(workspaceSlug, projectId, taskId, approvalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/approvals/${approvalId}/review/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: approvalsKey(workspaceSlug, projectId, taskId) });
    },
  });
}
