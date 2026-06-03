import { useEffect, useState, useRef } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderKanban, Users, Settings, LogOut,
  ChevronDown, Search, Map, BarChart2, Plus, Check, Clock, Square,
  Inbox, Briefcase,
} from "lucide-react";
import { useActiveTimer, useStopTimer, formatDuration } from "@/hooks/useTimeTracking";
import NotificationBell from "@/components/layout/NotificationBell";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";

export default function AppLayout({ onOpenPalette }) {
  const { workspaceSlug } = useParams();
  const { user, logout } = useAuthStore();
  const { setTheme, setAccent, setDensity } = useThemeStore();
  const navigate = useNavigate();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/`).then((r) => r.data),
    enabled: !!workspaceSlug,
  });

  // Sync theme preferences from the logged-in user's profile
  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/api/users/me/").then((r) => r.data),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!meData) return;
    if (meData.theme)        setTheme(meData.theme);
    if (meData.accent_color) setAccent(meData.accent_color);
    if (meData.density_mode) setDensity(meData.density_mode);
  }, [meData]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogout = async () => {
    await logout(); // authStore.logout() now calls queryClient.clear() internally
    navigate("/login");
  };

  const navLinks = [
    { to: `/w/${workspaceSlug}/dashboards`,  icon: LayoutDashboard,    label: "Dashboards"  },
    { to: `/w/${workspaceSlug}/projects`,    icon: FolderKanban,       label: "Projects"    },
    { to: `/w/${workspaceSlug}/my-work`,     icon: Inbox,     label: "My Work"  },
    { to: `/w/${workspaceSlug}/portfolio`,   icon: Briefcase, label: "Portfolio" },
    { to: `/w/${workspaceSlug}/roadmap`,     icon: Map,                label: "Roadmap"     },
    { to: `/w/${workspaceSlug}/timesheets`,  icon: Clock,              label: "Timesheets"  },
    { to: `/w/${workspaceSlug}/members`,     icon: Users,              label: "Members"     },
    { to: `/w/${workspaceSlug}/settings`,    icon: Settings,           label: "Settings"    },
  ];

  const initials    = workspace?.name?.[0]?.toUpperCase() || "W";
  const userInitial = user?.display_name?.[0]?.toUpperCase() || "U";

  const { data: activeTimer } = useActiveTimer(workspaceSlug);
  const stopTimer = useStopTimer(workspaceSlug);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className="w-64 flex-shrink-0 border-r flex flex-col"
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {/* Workspace switcher */}
        <WorkspaceSwitcher
          currentWorkspace={workspace}
          currentSlug={workspaceSlug}
          canCreate={meData?.can_create_workspace ?? false}
        />

        {/* Search / command palette */}
        <div className="px-3 pt-2.5 pb-2">
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground bg-background border border-border/70 hover:border-border hover:text-foreground shadow-sm transition-all active:scale-[0.98]"
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] bg-muted border border-border rounded px-1 py-0.5 leading-none font-mono">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
          {navLinks.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors active:scale-[0.98]",
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Active timer strip — v2.8.0 */}
        {activeTimer && (
          <div className="mx-3 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-red-600 leading-none">Timer running</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {activeTimer.task_title || "Task"}
              </p>
            </div>
            <button
              onClick={() => stopTimer.mutate()}
              className="p-1 rounded text-red-500 hover:bg-red-500/20 transition-colors flex-shrink-0"
              title="Stop timer"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          </div>
        )}

        {/* User panel */}
        <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-1">
          {/* Appearance toggle */}
          <ThemeToggle />

          {/* User info + actions */}
          <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate leading-tight text-foreground">
                {user?.display_name}
              </p>
              <p className="text-xs text-muted-foreground truncate leading-tight mt-0.5">
                {user?.email}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <Tooltip content="Sign out" side="top">
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

// ── WorkspaceSwitcher ─────────────────────────────────────────────────────────

function WorkspaceSwitcher({ currentWorkspace, currentSlug, canCreate }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  const { data: allWorkspaces = [] } = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get("/api/workspaces/").then((r) => r.data.results || r.data),
    staleTime: 60_000,
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials = currentWorkspace?.name?.[0]?.toUpperCase() || "W";

  return (
    <div ref={ref} className="px-3 pt-3 pb-2.5 border-b border-border/60 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent transition-colors group active:scale-[0.98]"
      >
        <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
          {initials}
        </div>
        <span className="flex-1 text-left truncate text-sm font-semibold text-foreground">
          {currentWorkspace?.name || "Loading…"}
        </span>
        <ChevronDown className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform",
          open && "rotate-180"
        )} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-popover border rounded-xl shadow-popover py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Your workspaces
          </p>

          {allWorkspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => { navigate(`/w/${ws.slug}`); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left"
            >
              <div className="w-6 h-6 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">
                {ws.name?.[0]?.toUpperCase()}
              </div>
              <span className="text-sm flex-1 truncate">{ws.name}</span>
              {ws.slug === currentSlug && (
                <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              )}
            </button>
          ))}

          {canCreate && (
            <>
              <div className="border-t mx-2 my-1" />
              <button
                onClick={() => { navigate("/onboarding"); setOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent transition-colors text-left text-muted-foreground hover:text-foreground"
              >
                <div className="w-6 h-6 rounded-md border border-dashed border-border flex items-center justify-center flex-shrink-0">
                  <Plus className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm">New workspace</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
