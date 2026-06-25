import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { Search, ChevronsLeft, ChevronsRight } from "lucide-react";
import { resolvedNavGroups, workspaceUrl } from "@/shared/lib/navLinks";
import { usePermission } from "@/contexts/PermissionsContext";
import { useInboxUnreadCount } from "@/shared/hooks/useInbox";
import UserPanel from "@/shared/components/layout/UserPanel";
import { ShortcutTooltip } from "@/shared/components/ui/ShortcutTooltip";
import AppSwitcherDropdown from "@/shared/components/layout/AppSwitcherDropdown";
import { useActiveApp } from "@/shared/hooks/useActiveApp";

export default function Sidebar({
  workspace,
  workspaceId,
  user,
  isFocusMode,
  collapsed,
  onToggleCollapse,
  onOpenPalette,
  onOpenSettings,
  onOpenShortcuts,
  onEnableFocus,
  onDisableFocus,
  onLogout,
}) {
  const inboxUnread = useInboxUnreadCount(workspaceId);
  const { can, isOwner, hasAppAccess, isLoading: permsLoading } = usePermission();
  const activeApp = useActiveApp();
  const navigate = useNavigate();

  const NAV_SHORTCUTS = {
    dashboards: "g d",
    boards: "g p",
    "my-work": "g w",
    goals: "g g",
    analytics: "g a",
    settings: "g s",
    members: "g m"
  };

  // Build filtered nav groups — gated only by workspace-level permissions (e.g. settings.manage)
  const allNavGroups = resolvedNavGroups()
    .map((group) => ({
      ...group,
      items: group.items
        .filter(
          (item) =>
            !item.permission || isOwner || permsLoading || can(item.permission),
        )
        .map((item) => ({
          to: workspaceUrl(workspaceId, item.path),
          icon: item.icon,
          label: item.label,
          key: item.key,
          end: item.end ?? false,
          collapsible: item.collapsible ?? false,
        })),
    }))
    .filter((group) => group.items.length > 0);

  // Show only the current app's groups; gate all product apps by app_access.
  // workspace is always visible (settings, members, etc. are permission-gated per item).
  const targetApp = activeApp === "launcher" ? "workspace" : activeApp;
  const navGroups = allNavGroups.filter((g) => {
    if (g.app !== targetApp) return false;
    if (g.app === "workspace") return true;
    if (permsLoading) return true;
    if (!isOwner && !hasAppAccess(g.app)) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        "flex-shrink-0 border-r flex flex-col transition-[width] duration-200 ease-out",
        collapsed ? "w-12" : "w-64",
      )}
      style={{ background: "hsl(var(--sidebar-bg))" }}
    >
      {collapsed ? (
        /* ── Collapsed header — logo navigates home, hover reveals expand button ── */
        <div className="relative group border-b border-border/40 py-3 flex items-center justify-center">
          <button
            onClick={() => navigate(workspaceUrl(workspaceId, "apps"))}
            title={workspace?.name}
            className="flex items-center justify-center"
          >
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs flex-shrink-0 overflow-hidden">
              {workspace?.logo ? (
                <img src={workspace.logo} className="w-full h-full object-cover" alt="" />
              ) : (
                workspace?.name?.[0]?.toUpperCase() ?? "W"
              )}
            </div>
          </button>

          {/* Expand button — floats on the right edge, appears on hover */}
          <ShortcutTooltip label="Expand sidebar" shortcut="Ctrl+." side="right" delayDuration={200}>
            <button
              onClick={onToggleCollapse}
              className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-accent"
            >
              <ChevronsRight className="w-3 h-3 text-muted-foreground" />
            </button>
          </ShortcutTooltip>
        </div>
      ) : (
        <div className="border-b border-border/40">
          <div className="flex items-center gap-2 w-full px-3 py-2.5 group">
            <button
              onClick={() => navigate(workspaceUrl(workspaceId, "apps"))}
              title={`Go to ${workspace?.name ?? "home"}`}
              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-95 transition-opacity text-left"
            >
              <div className="w-7 h-7 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold text-[10px] flex-shrink-0 overflow-hidden">
                {workspace?.logo ? (
                  <img src={workspace.logo} className="w-full h-full object-cover" alt="" />
                ) : (
                  workspace?.name?.[0]?.toUpperCase() ?? "W"
                )}
              </div>
              <span className="flex-1 text-sm font-semibold text-foreground truncate">
                {workspace?.name ?? "Workspace"}
              </span>
            </button>

            <ShortcutTooltip label="Collapse sidebar" shortcut="Ctrl+." side="bottom" delayDuration={200}>
              <button
                onClick={onToggleCollapse}
                className="p-1 rounded hover:bg-accent transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
              >
                <ChevronsLeft className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </ShortcutTooltip>
          </div>
        </div>
      )}

      {/* Search bar — hidden when collapsed or on launcher page */}
      {!collapsed && activeApp !== "launcher" && (
        <div className="px-3 pt-3 pb-2">
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
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-1 px-1.5">
        {collapsed ? (
          /* Collapsed: icon-only, all modules visible */
          <div className="flex flex-col items-center gap-0.5 py-1">
            {navGroups.length === 0 && (
              <span className="text-[10px] text-muted-foreground/50 select-none tracking-widest uppercase mt-3"
                style={{ writingMode: "vertical-rl" }}>
                No access
              </span>
            )}
            {navGroups.flatMap((group) =>
              group.items.map(({ to, icon: Icon, label, key, end }) => (
                <ShortcutTooltip key={to} label={label} shortcut={NAV_SHORTCUTS[key]} side="right" delayDuration={100}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      cn(
                        "w-8 h-8 flex items-center justify-center rounded transition-colors relative",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {key === "inbox" && inboxUnread > 0 && (
                      <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </NavLink>
                </ShortcutTooltip>
              )),
            )}
          </div>
        ) : (
          /* Expanded: active app's groups only */
          navGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-1.5 py-8 select-none">
              <span className="text-xs font-medium text-muted-foreground">No access</span>
              <span className="text-[11px] text-muted-foreground/50 text-center px-4 leading-relaxed">
                You don't have access to any section in this app.
              </span>
            </div>
          ) :
          navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ to, icon: Icon, label, key, end }) => {
                  // TODO: collapsible sub-items (boards list) — restore when nav sub-items are re-enabled
                  const shortcut = NAV_SHORTCUTS[key];
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        cn(
                          "group/nav flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors active:scale-[0.98]",
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
                      {shortcut && (
                        <kbd className="hidden group-hover/nav:inline-flex text-xs font-mono bg-muted border border-border rounded px-1 py-0.5 leading-none text-muted-foreground">
                          {shortcut}
                        </kbd>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* App switcher — always visible, collapsed or not */}
      <AppSwitcherDropdown workspaceId={workspaceId} collapsed={collapsed} />

      {/* User panel */}
      <UserPanel
        user={user}
        workspace={workspace}
        workspaceId={workspaceId}
        isFocusMode={isFocusMode}
        collapsed={collapsed}
        onEnableFocus={onEnableFocus}
        onDisableFocus={onDisableFocus}
        onOpenSettings={onOpenSettings}
        onOpenShortcuts={onOpenShortcuts}
        onLogout={onLogout}
      />
    </aside>
  );
}
