import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { LayoutGrid, ChevronDown } from "lucide-react";
import { APP_DEFS, APP_LANDING, workspaceUrl } from "@/shared/lib/navLinks";
import { useModules } from "@/shared/hooks/useModules";
import { useActiveApp } from "@/shared/hooks/useActiveApp";

export default function AppSwitcherDropdown({ workspaceId }) {
  const activeApp = useActiveApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { isEnabled, isLoading: modulesLoading } = useModules();

  const visibleApps = APP_DEFS.filter(
    (app) =>
      app.key !== "workspace" &&
      (!app.moduleKey || modulesLoading || isEnabled(app.moduleKey)),
  );

  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative px-1.5 py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">Switch app</span>
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-1.5 right-1.5 top-full mt-1 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden py-1">
          {visibleApps.map((app) => {
            const Icon = app.icon;
            const isActive = activeApp === app.key;
            return (
              <button
                key={app.key}
                onClick={() => {
                  navigate(workspaceUrl(workspaceId, APP_LANDING[app.key]));
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent",
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span>{app.label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
