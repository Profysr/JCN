import { useQuery } from "@tanstack/react-query";
import api from "@/shared/lib/api";
import { useBoard } from "./useProjects";

// Fetches the full role → capabilities table from the backend.
// Result is shared across all hooks via React Query's cache.
export function useBoardRoleDefinitions(workspaceId, boardId) {
  return useQuery({
    queryKey: ["board-role-definitions", workspaceId, boardId],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceId}/boards/${boardId}/role-permissions/`)
        .then((r) => r.data),
    enabled: !!workspaceId && !!boardId,
    staleTime: Infinity, // role definitions never change at runtime
  });
}

// Returns the current user's effective permissions on a board.
// Derives capabilities from my_role (already in the board response) + the
// role definitions table — no hardcoded weights or thresholds on the frontend.
export function useBoardPermissions(workspaceId, boardId) {
  const { data: board, isLoading: boardLoading } = useBoard(workspaceId, boardId);
  const { data: roleDefs, isLoading: defsLoading } = useBoardRoleDefinitions(
    workspaceId,
    boardId,
  );

  const role = board?.my_role ?? null;
  const caps = (roleDefs && role) ? (roleDefs[role] ?? {}) : {};

  return {
    role,
    isLoaded: !boardLoading && !defsLoading && !!board && !!roleDefs,
    canView:    caps.view    ?? false,
    canEdit:    caps.edit    ?? false,
    canDelete:  caps.delete  ?? false,
    canMove:    caps.move    ?? false,
    canComment: caps.comment ?? false,
    canAdmin:   caps.admin   ?? false,
    isViewer:   role === "viewer",
  };
}
