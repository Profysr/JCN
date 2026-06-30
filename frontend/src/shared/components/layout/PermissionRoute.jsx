import { Outlet, useParams, useNavigate, useMatches } from "react-router-dom";
import { Lock } from "lucide-react";
import { usePermission } from "@/contexts/PermissionsContext";
import { Loader } from "@/shared/components/ui/Loader";
import { APP_DEFS } from "@/shared/lib/navLinks";

// Apps gated by hasAppAccess() — all APP_DEFS entries except "workspace",
// which uses granular permissions (settings.manage) instead of app-level access.
const APP_ACCESS_GATED = new Set(
  APP_DEFS.filter((a) => a.key !== "workspace").map((a) => a.key)
);

/**
 * Drop this inside any layout that has PermissionsProvider above it.
 * Reads handle.app and handle.permission from the deepest matched route and
 * shows a 404-style page if the user lacks access. Routes with no access
 * declaration are always allowed through.
 */
export default function PermissionGuard() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const matches = useMatches();
  const { can, hasAppAccess, isLoading } = usePermission();

  const appKey = matches
    .map((m) => m.handle?.app)
    .filter(Boolean)
    .at(-1);

  const requiredPermission = matches
    .map((m) => m.handle?.permission)
    .filter(Boolean)
    .at(-1);

  if (isLoading) {
    return <Loader size="xl" className="min-h-screen bg-background" />;
  }

  const denied =
    (requiredPermission && !can(requiredPermission)) ||
    (appKey && APP_ACCESS_GATED.has(appKey) && !hasAppAccess(appKey));

  if (denied) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Lock className="w-7 h-7 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-base font-semibold">Page not found</h2>
          <p className="text-sm text-muted-foreground">
            You don&apos;t have permission to access this page.
          </p>
          <button
            onClick={() => navigate(`/w/${workspaceId}`)}
            className="text-sm text-primary hover:underline"
          >
            Go back to workspace
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
