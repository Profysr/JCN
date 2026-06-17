import { useBoard } from "./useProjects";
import { PROJECT_ROLE_WEIGHT, ACTION_MIN } from "@/lib/constants";

export function useBoardPermissions(workspaceId, boardId) {
  const { data: board, isLoading } = useBoard(workspaceId, boardId);

  const role   = board?.my_role ?? null;
  const weight = PROJECT_ROLE_WEIGHT[role] ?? 0;

  return {
    role,
    isLoaded:  !isLoading && !!board,
    canView:   weight >= ACTION_MIN.view,
    canEdit:   weight >= ACTION_MIN.edit,
    canDelete: weight >= ACTION_MIN.delete,
    canAdmin:  weight >= ACTION_MIN.admin,
    isViewer:  role === "viewer",
  };
}
