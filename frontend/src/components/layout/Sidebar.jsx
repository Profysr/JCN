import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Search,
  Plus,
  Check,
  Square,
} from "lucide-react";
import { resolvedNavGroups, workspaceUrl } from "@/lib/navLinks";
import { useInboxUnreadCount } from "@/hooks/useInbox";
import { useWorkspaces } from "@/hooks/useWorkspace";
import { useActiveTimer, useStopTimer } from "@/hooks/useTimeTracking";
import UserPanel from "@/components/layout/UserPanel";

export default function Sidebar({
  workspace,
  workspaceSlug,
  user,
  isFocusMode,
  onOpenPalette,
  onOpenSettings,
  onOpenShortcuts,
  onEnableFocus,
  onDisableFocus,
  onLogout,
}) {
  const { data: activeTimer } = useActiveTimer(workspaceSlug);
  const stopTimer = useStopTimer(workspaceSlug);
  const inboxUnread = useInboxUnreadCount(workspaceSlug);

  const navGroups = resolvedNavGroups().map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      to: workspaceUrl(workspaceSlug, item.path),
      icon: item.icon,
      label: item.label,
      key: item.key,
      end: item.end ?? false,
    })),
  }));

  return (
    <aside
      className="w-64 flex-shrink-0 border-r flex flex-col"
      style={{ background: "hsl(var(--sidebar-bg))" }}
    >
      {/* Workspace switcher */}
      <WorkspaceSwitcher
        currentWorkspace={workspace}
        currentSlug={workspaceSlug}
        canCreate={user?.can_create_workspace ?? false}
      />

      {/* Search / command palette */}
      <div className="px-3 pt-2.5 pb-2">
        <button
          onClick={onOpenPalette}
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
      <nav className="flex-1 px-2 py-1 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-3" : ""}>
            {group.label && (
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, key, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors active:scale-[0.98]",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{label}</span>
                  {key === "inbox" && inboxUnread > 0 && !isFocusMode && (
                    <span className="min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                      {inboxUnread > 9 ? "9+" : inboxUnread}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Active timer strip — v2.8.0 */}
      {activeTimer && (
        <div className="mx-3 mb-1 flex items-center gap-2 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-red-600 leading-none">
              Timer running
            </p>
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
      <UserPanel
        user={user}
        isFocusMode={isFocusMode}
        onEnableFocus={onEnableFocus}
        onDisableFocus={onDisableFocus}
        onOpenSettings={onOpenSettings}
        onOpenShortcuts={onOpenShortcuts}
        onLogout={onLogout}
      />
    </aside>
  );
}

// ── WorkspaceSwitcher ─────────────────────────────────────────────────────────
function WorkspaceSwitcher({ currentWorkspace, currentSlug, canCreate }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef(null);

  const { data: allWorkspaces = [] } = useWorkspaces();

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const initials = currentWorkspace?.name?.[0]?.toUpperCase() || "W";

  return (
    <div
      ref={ref}
      className="px-3 pt-3 pb-2.5 border-b border-border/60 relative"
    >
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
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-popover border rounded-md shadow-popover py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Your workspaces
          </p>

          {allWorkspaces.map((ws) => (
            <button
              key={ws.id}
              onClick={() => {
                navigate(`/w/${ws.slug}`);
                setOpen(false);
              }}
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
                onClick={() => {
                  navigate("/onboarding");
                  setOpen(false);
                }}
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
