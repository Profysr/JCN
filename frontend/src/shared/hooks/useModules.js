import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/shared/lib/api";

export function useModulesQuery(workspaceId) {
  return useQuery({
    queryKey: ["workspace-modules", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/modules/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });
}

export function useToggleModule(workspaceId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleKey, isEnabled }) =>
      api
        .patch(`/api/workspaces/${workspaceId}/modules/${moduleKey}/`, { is_enabled: isEnabled })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace-modules", workspaceId] }),
  });
}

/**
 * Returns { isEnabled(key: string): boolean, isLoading: boolean, modules: object[] }
 * Must be used inside AppLayout (which provides ModulesContext).
 * `isEnabled("org_structure")` returns true when the module is active.
 */
export const ModulesContext = createContext(null);
export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) {
    return { isEnabled: () => false, isLoading: true, modules: [] };
  }
  return ctx;
}
