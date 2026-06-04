import { useEffect, useState, useRef } from "react";
import { Outlet, NavLink, useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Users, Settings, LogOut,
  ChevronDown, Search, BarChart2, Plus, Check, Square, BellOff, SlidersHorizontal,
} from "lucide-react";
import { useInboxUnreadCount } from "@/hooks/useInbox";
import { NAV_ITEMS, workspaceUrl } from "@/lib/navLinks";
import { useActiveTimer, useStopTimer, formatDuration } from "@/hooks/useTimeTracking";
import { useAnnouncePresence } from "@/hooks/usePresence";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import NotificationBell from "@/components/layout/NotificationBell";
import CommandPalette from "@/components/CommandPalette";
import ShortcutOverlay from "@/components/ShortcutOverlay";
import UserSettingsModal from "@/components/UserSettingsModal";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Tooltip } from "@/components/ui/tooltip";

export default function AppLayout() {
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
  }, [meData]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLinks = NAV_ITEMS.map(item => ({
    to:    workspaceUrl(workspaceSlug, item.path),
    icon:  item.icon,
    label: item.label,
    key:   item.key,
  }));

  const initials    = workspace?.name?.[0]?.toUpperCase() || "W";
  const userInitial = user?.display_name?.[0]?.toUpperCase() || "U";

  const { data: activeTimer } = useActiveTimer(workspaceSlug);
  const stopTimer = useStopTimer(workspaceSlug);
  const inboxUnread = useInboxUnreadCount(workspaceSlug);

  // v3.5.0 — announce workspace-level presence so other users see us as online
  useAnnouncePresence(workspaceSlug, "project", workspaceSlug);

  // v3.9.0 — command palette + shortcut overlay + user settings modal
  const [paletteOpen,   setPaletteOpen]   = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [settingsTab,   setSettingsTab]   = useState("me");

  useKeyboardShortcuts({
    onOpenPalette:   () => setPaletteOpen((o) => !o),
    onOpenShortcuts: () => setShortcutsOpen((o) => !o),
    onCreateTask:    () => {
      // Dispatch a custom event; KanbanPage (and other pages) can listen
      window.dispatchEvent(new CustomEvent("jcn:create-task"));
    },
    onOpenFilter: () => {
      window.dispatchEvent(new CustomEvent("jcn:focus-filter"));
    },
  });

  // v3.7.0 — Focus Mode DND: snooze in-app notifications for a chosen duration
  const [focusModeUntil, setFocusModeUntil] = useState(() => {
    const stored = localStorage.getItem("jcn_focus_until");
    return stored ? parseInt(stored, 10) : null;
  });
  const isFocusMode = focusModeUntil && Date.now() < focusModeUntil;

  const enableFocusMode = (hours) => {
    const until = Date.now() + hours * 3_600_000;
    setFocusModeUntil(until);
    localStorage.setItem("jcn_focus_until", String(until));
  };
  const disableFocusMode = () => {
    setFocusModeUntil(null);
    localStorage.removeItem("jcn_focus_until");
  };

  const [focusMenuOpen, setFocusMenuOpen] = useState(false);
  const focusRef = useRef(null);
  useEffect(() => {
    if (!focusMenuOpen) return;
    const h = (e) => { if (focusRef.current && !focusRef.current.contains(e.target)) setFocusMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [focusMenuOpen]);

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
            onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-muted-foreground bg-background border border-border/70 hover:border-border hover:text-foreground shadow-sm transition-all active:scale-[0.98]"
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] font-semibold bg-muted border border-border rounded px-1 py-0.5 leading-none font-mono">
              ⌘ + K
            </kbd>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
          {navLinks.map(({ to, icon: Icon, label, end, key }) => (
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
              <span className="flex-1">{label}</span>
              {/* Inbox unread badge */}
              {label === "Inbox" && inboxUnread > 0 && !isFocusMode && (
                <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {inboxUnread > 9 ? "9+" : inboxUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* v3.7.0 — Focus Mode DND toggle */}
        <div ref={focusRef} className="mx-3 mb-1 relative">
          {isFocusMode ? (
            <button
              onClick={disableFocusMode}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-600 hover:bg-violet-500/15 transition-colors"
            >
              <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="text-xs font-medium flex-1 text-left">Focus Mode on</span>
              <span className="text-[10px] text-violet-500 opacity-80">tap to disable</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setFocusMenuOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-muted-foreground hover:bg-accent transition-colors"
              >
                <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="text-xs">Focus Mode</span>
              </button>
              {focusMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-popover py-1">
                  {[["1h","1 hour"], ["4h","4 hours"], ["8h","8 hours"]].map(([k, label]) => (
                    <button
                      key={k}
                      onClick={() => { enableFocusMode(parseFloat(k)); setFocusMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                    >
                      Mute for {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

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
            <Tooltip content="Account settings" side="top">
              <button
                onClick={() => { setSettingsTab("me"); setSettingsOpen(true); }}
                className="relative flex-shrink-0 group"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold group-hover:ring-2 group-hover:ring-primary/30 transition-all">
                  {userInitial}
                </div>
                {/* Online presence dot */}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-sidebar-bg" />
              </button>
            </Tooltip>
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
              <Tooltip content="Preferences" side="top">
                <button
                  onClick={() => { setSettingsTab("preferences"); setSettingsOpen(true); }}
                  className="p-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="Keyboard shortcuts" side="top">
                <button
                  onClick={() => setShortcutsOpen(true)}
                  className="p-1.5 rounded-md text-foreground/60 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                >
                  <kbd className="text-[10px] font-bold leading-none">?</kbd>
                </button>
              </Tooltip>
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

      {/* v3.9.0 — global overlays owned here */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {shortcutsOpen && <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />}
      {settingsOpen  && (
        <UserSettingsModal
          defaultTab={settingsTab}
          onClose={() => setSettingsOpen(false)}
        />
      )}
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
