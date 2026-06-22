import { useNavigate, useParams } from "react-router-dom";
import { WORKSPACE_NAV_ITEMS, workspaceUrl } from "@/shared/lib/navLinks";
import { useModules } from "@/shared/hooks/useModules";
import {
  FolderKanban,
  Network,
  Users2,
  BarChart2,
  Lock,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

/**
 * Frontend-only visual metadata per module key.
 * Name and description come from the API — only icon, color, and landing route live here.
 * The API also returns an `icon` string field which we destructure out before spreading
 * so it doesn't overwrite our Lucide component reference.
 */
const MODULE_VISUAL = {
  projects: {
    Icon: FolderKanban,
    landing: "boards",
    iconBg: "bg-violet-500/15",
    iconColor: "text-violet-500",
  },
  org_structure: {
    Icon: Network,
    landing: "departments",
    iconBg: "bg-blue-500/15",
    iconColor: "text-blue-500",
  },
  hr_management: {
    Icon: Users2,
    landing: "hr",
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-500",
  },
  analytics_advanced: {
    Icon: BarChart2,
    landing: "analytics",
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
  },
};

const WORKSPACE_PAGES = WORKSPACE_NAV_ITEMS;

export default function AppLauncherPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { modules, isLoading: modulesLoading } = useModules();

  const apps = modules
    .filter((m) => MODULE_VISUAL[m.key])
    .map(({ icon: _apiIcon, ...m }) => ({ ...MODULE_VISUAL[m.key], ...m }));

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
                  className="h-36 rounded-xl border border-border/40 bg-muted/20 animate-pulse"
                />
              ))
            : apps.map((app) => {
                const { Icon } = app;
                const locked = !app.is_enabled;

                return (
                  <button
                    key={app.key}
                    onClick={() =>
                      !locked && navigate(workspaceUrl(workspaceId, app.landing))
                    }
                    disabled={locked}
                    className={cn(
                      "relative group text-left p-5 rounded-xl border transition-all duration-150",
                      locked
                        ? "opacity-55 cursor-not-allowed border-border/40 bg-muted/20"
                        : "cursor-pointer border-border/50 bg-card hover:shadow-md hover:-translate-y-0.5 hover:border-border",
                    )}
                  >
                    <div
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center mb-4",
                        app.iconBg,
                      )}
                    >
                      <Icon className={cn("w-5 h-5", app.iconColor)} />
                    </div>

                    <div className="flex items-center gap-1.5 mb-1.5">
                      <h3 className="font-semibold text-sm leading-none">{app.name}</h3>
                      {locked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted border border-border/50 px-1.5 py-0.5 rounded-full">
                          <Lock className="w-2.5 h-2.5" />
                          Not enabled
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {app.description}
                    </p>

                    {!locked && (
                      <ArrowUpRight className="absolute top-5 right-5 w-3.5 h-3.5 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors" />
                    )}
                  </button>
                );
              })}
        </div>

        {/* Workspace utility pages — sourced from navLinks (workspaceLevel: true) */}
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Workspace
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {WORKSPACE_PAGES.map((page) => {
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
