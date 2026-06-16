import { useBoard } from "./useProjects";

/**
 * Derives the current user's effective role from the board's `my_role` field.
 * No extra request — piggybacks on the board detail already in the cache.
 *
 * Role weights (mirrors backend permissions.py):
 *   admin=4  editor=3  viewer=2  guest=1
 * Action minimums:
 *   view=2  edit=3  delete=3  admin=4
 */
const ROLE_WEIGHT = { admin: 4, editor: 3, viewer: 2, guest: 1 };

export function useBoardPermissions(workspaceId, boardId) {
  const { data: project, isLoading } = useBoard(workspaceId, boardId);

  const role   = project?.my_role ?? null;
  const weight = ROLE_WEIGHT[role] ?? 0;

  return {
    role,
    isLoaded:  !isLoading && !!project,
    canView:   weight >= 2,
    canEdit:   weight >= 3,
    canDelete: weight >= 3,
    canAdmin:  weight >= 4,
    isViewer:  role === "viewer",
  };
}
