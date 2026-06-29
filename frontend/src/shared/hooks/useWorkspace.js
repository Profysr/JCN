import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

/** Fetch a single workspace by ID. Shared across pages/layout. */
export function useWorkspace(workspaceId) {
  return useQuery({
    queryKey: ["workspace", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity, // never auto-refetch
    refetchOnWindowFocus: false, // don't refetch on tab switch
  });
}

/** List all workspaces the current user belongs to. */
export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () =>
      api.get("/api/workspaces/").then((r) => r.data.results || r.data),
    staleTime: Infinity, // never auto-refetch
    refetchOnWindowFocus: false, // don't refetch on tab switch
  });
}

export const useCreateWorkspace = (options = {}) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      api.post("/api/workspaces/", data).then((r) => r.data),
    onSuccess: (workspace) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      options.onSuccess?.(workspace);
    },
    onError: options.onError,
  });
};

export const useUpdateWorkspace = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => {
      const hasFile =
        data instanceof FormData ||
        Object.values(data).some((v) => v instanceof File);
      const payload = hasFile
        ? (() => {
            const fd = new FormData();
            Object.entries(data).forEach(
              ([k, v]) => v != null && fd.append(k, v),
            );
            return fd;
          })()
        : data;
      const headers = hasFile ? { "Content-Type": "multipart/form-data" } : {};
      return api
        .patch(`/api/workspaces/${workspaceId}/`, payload, { headers })
        .then((r) => r.data);
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["workspaces"] });
      qc.setQueryData(["workspace", workspaceId], updated);
    },
  });
};

export const useDeleteWorkspace = (workspaceId) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete(`/api/workspaces/${workspaceId}/`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaces"] }),
  });
};
