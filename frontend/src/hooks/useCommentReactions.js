import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

export function useToggleReaction(workspaceSlug, projectId, taskId) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, emoji }) =>
      api
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/${taskId}/comments/${commentId}/reactions/`,
          { emoji }
        )
        .then((r) => r.data),

    onSuccess: (data, { commentId }) => {
      // Patch the reactions on the cached task detail
      qc.setQueryData(
        ["task-detail", workspaceSlug, projectId, taskId],
        (old) => {
          if (!old) return old;
          return {
            ...old,
            comments: old.comments?.map((c) =>
              c.id === commentId ? { ...c, reactions: data.reactions } : c
            ) || [],
          };
        }
      );
    },
  });
}
