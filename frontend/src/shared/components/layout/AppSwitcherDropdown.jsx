import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { LayoutGrid, Home } from "lucide-react";
import { APP_DEFS, workspaceUrl } from "@/shared/lib/navLinks";
import { APP_PARAM } from "@/shared/onboarding/tour/tourSteps";
import { usePermission } from "@/contexts/PermissionsContext";
import { useActiveApp } from "@/shared/hooks/useActiveApp";
import { useUnreadNotificationsByApp } from "@/shared/hooks/useInbox";
import { Tooltip } from "@/shared/components/ui/tooltip";

function AppList({ activeApp, visibleApps, unreadByApp, onNavigate, onGoHome }) {
  return (
    <div className="py-1">
      <button
        onClick={onGoHome}
        className="flex items-center gap-2.5 w-full px-2 mx-1 py-2 rounded-md text-sm transition-colors text-muted-foreground hover:bg-accent hover:text-foreground"
        style={{ width: "calc(100% - 8px)" }}
      >
        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-muted">
          <Home className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <span className="flex-1 text-left text-sm">All apps</span>
      </button>
      <div className="mx-3 my-1 border-t border-border/60" />
      <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 select-none">
        Apps
      </p>
      {visibleApps.map((app) => {
        const Icon = app.icon;
        const isActive = activeApp === app.key;
        const c = app.colors;
        return (
          <button
            key={app.key}
            onClick={() => onNavigate(app)}
            className={cn(
              "flex items-center gap-2.5 w-full px-2 mx-1 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            style={{ width: "calc(100% - 8px)" }}
          >
            <div className={cn("relative w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0", c.bg)}>
              <Icon className={cn("w-3.5 h-3.5", c.text)} />
              {/* Unread dot — the only way to notice a missed notification in
                  an app you haven't opened without going through the bell. */}
              {unreadByApp[app.key] && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-popover" />
              )}
            </div>
            <span className={cn("flex-1 text-left text-sm", isActive && "font-medium")}>
              {app.label}
            </span>
            {isActive && (
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", c.solid)} />
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function AppSwitcherDropdown({ workspaceId, collapsed }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const activeApp = useActiveApp();
  const { isOwner, hasAppAccess, isLoading: permsLoading } = usePermission();
  const unreadByApp = useUnreadNotificationsByApp(workspaceId);

  const visibleApps = APP_DEFS.filter((app) => {
    if (app.key === "workspace") return false;
    if (permsLoading) return true;
    if (!isOwner && !hasAppAccess(app.key)) return false;
    return true;
  });

  const currentApp = APP_DEFS.find((a) => a.key === activeApp);
  const colors = currentApp?.colors ?? APP_DEFS[0].colors;
  const CurrentIcon = currentApp?.icon ?? LayoutGrid;

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  const handleNavigate = (app) => {
    navigate(`${workspaceUrl(workspaceId, app.landing)}?${APP_PARAM}=${app.key}`);
    setOpen(false);
  };

  const handleGoHome = () => {
    navigate(workspaceUrl(workspaceId, "apps"));
    setOpen(false);
  };

  // ── Collapsed: colored icon button, flyout to the right ───────────────────
  if (collapsed) {
    return (
      <div
        ref={ref}
        className="border-t border-border/60 py-2 flex justify-center relative"
      >
        <Tooltip content="Switch app" side="right" delayDuration={100}>
          <button
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
              colors.bg,
            )}
          >
            <CurrentIcon className={cn("w-4 h-4", colors.text)} />
          </button>
        </Tooltip>

        {open && (
          <div className="absolute left-full bottom-0 ml-2 z-50 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-scale-in origin-bottom-left">
            <AppList
              activeApp={activeApp}
              visibleApps={visibleApps}
              unreadByApp={unreadByApp}
              onNavigate={handleNavigate}
              onGoHome={handleGoHome}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Expanded: full trigger row, dropdown opens upward ─────────────────────
  return (
    <div
      ref={ref}
      className="px-3 pb-2 pt-1.5 border-t border-border/60 relative"
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-accent transition-colors group"
      >
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors", colors.bg)}>
          <CurrentIcon className={cn("w-4 h-4", colors.text)} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold text-foreground truncate leading-tight">
            {currentApp?.label ?? "Apps"}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
            Switch app
          </p>
        </div>
        <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
      </button>

      {open && (
        <div className="absolute left-3 right-3 bottom-full mb-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden animate-scale-in origin-bottom">
          <AppList
            activeApp={activeApp}
            visibleApps={visibleApps}
            unreadByApp={unreadByApp}
            onNavigate={handleNavigate}
            onGoHome={handleGoHome}
          />
        </div>
      )}
    </div>
  );
}
