import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, FolderKanban, Users, Settings, LogOut,
  ChevronDown, Search, Map,
} from "lucide-react";
import NotificationBell from "@/components/layout/NotificationBell";

export default function AppLayout({ onOpenPalette }) {
  const { workspaceSlug } = useParams();
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: workspace } = useQuery({
    queryKey: ["workspace", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/`).then((r) => r.data),
    enabled: !!workspaceSlug,
  });

  const handleLogout = async () => {
    await logout();
    qc.clear();
    navigate("/login");
  };

  const navLinks = [
    { to: `/w/${workspaceSlug}`,          icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: `/w/${workspaceSlug}/projects`, icon: FolderKanban,    label: "Projects" },
    { to: `/w/${workspaceSlug}/roadmap`,  icon: Map,             label: "Roadmap" },
    { to: `/w/${workspaceSlug}/members`,  icon: Users,           label: "Members" },
    { to: `/w/${workspaceSlug}/settings`, icon: Settings,        label: "Settings" },
  ];

  const initials   = workspace?.name?.[0]?.toUpperCase() || "W";
  const userInitial = user?.display_name?.[0]?.toUpperCase() || "U";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className="w-64 flex-shrink-0 border-r flex flex-col overflow-hidden"
        style={{ background: "hsl(var(--sidebar-bg))" }}
      >
        {/* Workspace switcher */}
        <div className="px-3 pt-3 pb-2.5 border-b border-border/60">
          <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent transition-colors group">
            <div className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
              {initials}
            </div>
            <span className="flex-1 text-left truncate text-sm font-semibold text-foreground">
              {workspace?.name || "Loading…"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        </div>

        {/* Search / command palette */}
        <div className="px-3 pt-2.5 pb-2">
          <button
            onClick={onOpenPalette}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground bg-background border border-border/70 hover:border-border hover:text-foreground shadow-sm transition-all"
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
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

        {/* User panel */}
        <div className="px-3 pb-3 pt-2 border-t border-border/60">
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
            <div className="flex items-center gap-0.5">
              <NotificationBell />
              <button
                onClick={handleLogout}
                title="Sign out"
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
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
