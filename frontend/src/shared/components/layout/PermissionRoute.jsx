import { Outlet, Navigate, useLocation } from "react-router-dom";
import { usePermission } from "@/contexts/PermissionsContext";
import { Loader } from "@/shared/components/ui/Loader";
import { APP_DEFS, NAV_ITEMS } from "@/shared/lib/navLinks";

// Apps gated by hasAppAccess() — all APP_DEFS entries except "workspace",
// which uses granular permissions instead of app-level access.
const APP_ACCESS_GATED = new Set(
  APP_DEFS.filter((a) => a.key !== "workspace").map((a) => a.key)
);

// Derived from NAV_ITEMS: any nav item with a `permission` field automatically
// gates its route. workspace-relative path → permission key.
const ROUTE_PERM_MAP = Object.fromEntries(
  NAV_ITEMS.filter((n) => n.permission).map((n) => [n.path, n.permission])
);

function useRelPath() {
  const { pathname } = useLocation();
  const parts = pathname.split("/");
  return parts.length >= 4 ? parts.slice(3).join("/") : "";
}

/**
 * Layout route that enforces access control for a route group.
 *
 * Usage in App.jsx:
 *   <Route element={<AppGuard app="projects" />}>   // app-level access check
 *   <Route element={<AppGuard app="hr" />}>
 *   <Route element={<AppGuard />}>                   // permission-only (from ROUTE_PERM_MAP)
 *
 * Per-page permissions are driven entirely from NAV_ITEMS — any nav item with
 * a `permission` field automatically gates its route via ROUTE_PERM_MAP.
 * No explicit permission prop; no App.jsx changes needed when adding new ones.
 *
 * Redirects to /not-found if the user lacks access.
 */
export default function AppGuard({ app }) {
  const { can, hasAppAccess, isLoading } = usePermission();
  const routePermission = ROUTE_PERM_MAP[useRelPath()];

  if (isLoading) {
    return <Loader size="xl" className="min-h-screen bg-background" />;
  }

  const denied =
    (app && APP_ACCESS_GATED.has(app) && !hasAppAccess(app)) ||
    (routePermission && !can(routePermission));

  if (denied) {
    return <Navigate to="/not-found" replace />;
  }

  return <Outlet />;
}
