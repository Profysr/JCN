import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";

/**
 * Fetches the workspace permission registry — apps + permissions by app key.
 * Static data; cached indefinitely (staleTime: Infinity).
 *
 * Returns { apps, permissions } where:
 *   apps        = { [appKey]: { name, description, depends_on, icon } }
 *   permissions = { [appKey]: { [permKey]: { label } } }
 */
export function usePermissions(workspaceId) {
  return useQuery({
    queryKey: ["workspace-permissions", workspaceId],
    queryFn: () =>
      api.get(`/api/workspaces/${workspaceId}/permissions/`).then((r) => r.data),
    enabled: !!workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
