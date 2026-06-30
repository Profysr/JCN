import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { SOCKET_BACKED } from "@/shared/lib/queryClient";

function approvalsKey(workspaceId, boardId, taskId) {
  return ["approvals", workspaceId, boardId, taskId];
}

export function useApprovals(workspaceId, boardId, taskId) {
  return useQuery({
    queryKey: approvalsKey(workspaceId, boardId, taskId),
    queryFn: () =>
      api
        .get(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/approvals/`,
        )
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId && !!taskId,
    // Live via board socket (approval.created/updated)
    ...SOCKET_BACKED,
  });
}

export function useRequestApproval(workspaceId, boardId, taskId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/approvals/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: approvalsKey(workspaceId, boardId, taskId),
      });
    },
  });
}

export function useResubmitApproval(workspaceId, boardId, taskId, approvalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/approvals/${approvalId}/resubmit/`,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: approvalsKey(workspaceId, boardId, taskId),
      });
    },
  });
}

export function useSubmitReview(workspaceId, boardId, taskId, approvalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/approvals/${approvalId}/review/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: approvalsKey(workspaceId, boardId, taskId),
      });
    },
  });
}

export function useAdminOverrideApproval(workspaceId, boardId, taskId, approvalId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api
        .post(
          `/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${taskId}/approvals/${approvalId}/admin-override/`,
          data,
        )
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: approvalsKey(workspaceId, boardId, taskId),
      });
    },
  });
}
