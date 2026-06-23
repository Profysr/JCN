import { useNavigate, useParams } from "react-router-dom";
import {
  APP_DEFS,
  WORKSPACE_NAV_ITEMS,
  workspaceUrl,
} from "@/shared/lib/navLinks";
import { useModules } from "@/shared/hooks/useModules";
import { usePermission } from "@/contexts/PermissionsContext";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const _appByKey = Object.fromEntries(APP_DEFS.map((a) => [a.key, a]));
export default function AppLauncherPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { modules, isLoading: modulesLoading } = useModules();
  const { can, isOwner, isLoading: permsLoading } = usePermission();

  // API returns name/description/tier; APP_DEFS supplies icon, landing, colors.
  // Discard the API's string `icon` field so it doesn't shadow the Lucide component.
  const apps = modules
    .filter((m) => m.is_enabled)
    .filter((m) => _appByKey[m.key])
    .filter((m) => {
      const def = _appByKey[m.key];
      if (permsLoading) return true;
      if (def.permKey && !isOwner && !can(def.permKey)) return false;
      return true;
    })
    .map(({ icon: _apiIcon, ...m }) => ({ ...m, ..._appByKey[m.key] }));

  const visibleWorkspaceItems = WORKSPACE_NAV_ITEMS.filter((item) => {
    if (permsLoading) return true;
    if (item.permission && !isOwner && !can(item.permission)) return false;
    return true;
  });

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Apps</h1>
          <p className="text-sm text-muted-foreground">
            Your workspace ecosystem — pick an app to get started.
          </p>
        </div>

        {/* App cards — driven by the backend /modules API */}
        <div className="grid grid-cols-2 gap-3 mb-10">
          {modulesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 rounded-xl border border-border bg-muted animate-pulse"
                />
              ))
            : apps.map((app) => {
                const Icon = app.icon;
                return (
                  <button
                    key={app.key}
                    onClick={() => navigate(workspaceUrl(workspaceId, app.landing))}
                    className="relative group text-left p-5 rounded-xl border transition-all duration-150 cursor-pointer border-border/50 bg-card hover:shadow-md hover:-translate-y-0.5 hover:border-border"
                  >
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center mb-4",
                        app.colors.bg,
                      )}
                    >
                      <Icon className={cn("w-5 h-5", app.colors.text)} />
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5">
                      <h3 className="font-semibold text-sm leading-none">
                        {app.name}
                      </h3>
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {app.description}
                    </p>

                    <ArrowUpRight className="absolute top-5 right-5 w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                  </button>
                );
              })}
        </div>

        {/* Workspace utility pages — sourced from navLinks (workspaceLevel: true) */}
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Workspace
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {visibleWorkspaceItems.map((page) => {
            const Icon = page.icon;
            return (
              <button
                key={page.key}
                onClick={() => navigate(workspaceUrl(workspaceId, page.path))}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-card hover:bg-accent hover:border-border transition-all text-center group"
              >
                <Icon className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-tight">
                  {page.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
