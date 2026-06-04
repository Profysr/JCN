import { useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

const HEARTBEAT_MS = 30_000;

export function presenceKey(workspaceSlug, resourceType, resourceId) {
  return ["presence", workspaceSlug, resourceType, resourceId];
}

/** Fetch who is viewing a specific resource right now. */
export function usePresence(workspaceSlug, resourceType, resourceId) {
  return useQuery({
    queryKey: presenceKey(workspaceSlug, resourceType, resourceId),
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/presence/`, {
          params: { resource_type: resourceType, resource_id: resourceId },
        })
        .then((r) => r.data),
    enabled: !!workspaceSlug && !!resourceType && !!resourceId,
    refetchInterval: HEARTBEAT_MS,
    staleTime: 20_000,
  });
}

/**
 * Announce the current user's presence for a resource.
 * Sends heartbeat every 30s; sends leave on unmount.
 */
export function useAnnouncePresence(workspaceSlug, resourceType, resourceId) {
  const timerRef = useRef(null);
  const qc       = useQueryClient();

  const announce = useCallback(() => {
    if (!workspaceSlug || !resourceType || !resourceId) return;
    api
      .post(`/api/workspaces/${workspaceSlug}/presence/`, {
        resource_type: resourceType,
        resource_id: resourceId,
      })
      .then(() => {
        qc.invalidateQueries({ queryKey: presenceKey(workspaceSlug, resourceType, resourceId) });
      })
      .catch(() => {});
  }, [workspaceSlug, resourceType, resourceId, qc]);

  useEffect(() => {
    announce();
    timerRef.current = setInterval(announce, HEARTBEAT_MS);

    return () => {
      clearInterval(timerRef.current);
      if (workspaceSlug && resourceType && resourceId) {
        api
          .delete(`/api/workspaces/${workspaceSlug}/presence/`, {
            data: { resource_type: resourceType, resource_id: resourceId },
          })
          .catch(() => {});
        qc.invalidateQueries({ queryKey: presenceKey(workspaceSlug, resourceType, resourceId) });
      }
    };
  }, [announce, workspaceSlug, resourceType, resourceId, qc]);
}

/** Fetch all users online in a workspace (any resource, active in last 90s). */
export function useWorkspaceOnlineUsers(workspaceSlug) {
  return useQuery({
    queryKey: ["presence", workspaceSlug, "all"],
    queryFn: () =>
      api
        .get(`/api/workspaces/${workspaceSlug}/presence/`)
        .then((r) => r.data),
    enabled: !!workspaceSlug,
    refetchInterval: HEARTBEAT_MS,
    staleTime: 20_000,
  });
}
