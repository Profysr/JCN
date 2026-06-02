import { useProject } from "./useProjects";

/**
 * Derives the current user's effective role from the project's `my_role` field.
 * No extra request — piggybacks on the project detail already in the cache.
 */
export function useProjectPermissions(workspaceSlug, projectId) {
  const { data: project, isLoading } = useProject(workspaceSlug, projectId);

  const role = project?.my_role ?? null;

  return {
    role,
    isLoading,
    isLoaded:   !isLoading && !!project,
    canView:    role !== null,
    canEdit:    role === "admin" || role === "editor",
    canDelete:  role === "admin" || role === "editor",
    canAdmin:   role === "admin",
    isGuest:    role === "guest",
    isViewer:   role === "viewer",
  };
}
