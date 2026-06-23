import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/shared/lib/utils";
import { ChevronDown, Search, ChevronsLeft, ChevronsRight } from "lucide-react";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import { resolvedNavGroups, workspaceUrl } from "@/shared/lib/navLinks";
import { usePermission } from "@/contexts/PermissionsContext";
import { useModules } from "@/shared/hooks/useModules";
import { useInboxUnreadCount } from "@/shared/hooks/useInbox";
import { useBoards } from "@/apps/project-management/hooks/useProjects";

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
  const { data: boards = [] } = useBoards(workspaceId);
  const [openSections, setOpenSections] = useState({});
  const { can, isOwner, isLoading: permsLoading } = usePermission();
  const { isEnabled, isLoading: modulesLoading } = useModules();
  const activeApp = useActiveApp();
  const navigate = useNavigate();

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const NAV_SHORTCUTS = {
    dashboards: "g d",
    boards: "g p",
    "my-work": "g m",
    goals: "g g",
    analytics: "g a",
  };

  const subItemsMap = {
    boards: boards.map((b) => ({
      key: b.id,
      to: `/w/${workspaceId}/boards/${b.id}`,
      label: b.name,
      board_type: b.board_type,
    })),
  };

  // Build filtered nav groups
  const allNavGroups = resolvedNavGroups()
    .map((group) => ({
      ...group,
      items: group.items
        // Module gate — hide items whose module is disabled (not just loading)
        .filter(
          (item) =>
            !item.moduleKey ||
            modulesLoading ||
            isEnabled(item.moduleKey),
        )
        // Permission gate
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

  // Always show only the current app's groups — collapsed or not.
  // Launcher maps to workspace-level links; all other apps show their own groups.
  const navGroups = allNavGroups.filter(
    (g) => g.app === (activeApp === "launcher" ? "workspace" : activeApp)
  );

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
              className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left"
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
          navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? "mt-3" : ""}>
              {group.label && (
                <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 select-none">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map(({ to, icon: Icon, label, key, end, collapsible }) => {
                  const subItems = collapsible ? subItemsMap[key] : null;
                  const isOpen = openSections[key] ?? false;

                  if (subItems !== null && subItems !== undefined) {
                    return (
                      <div key={to}>
                        <NavLink
                          to={to}
                          end={end}
                          className={({ isActive }) =>
                            cn(
                              "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors active:scale-[0.98]",
                              isActive
                                ? "text-primary font-semibold"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )
                          }
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span className="flex-1">{label}</span>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSection(key);
                            }}
                            className="p-1 rounded-md hover:bg-primary/15 hover:text-primary transition-colors"
                            title={isOpen ? "Collapse" : `Expand ${label.toLowerCase()}`}
                          >
                            <ChevronDown
                              className={cn(
                                "w-3.5 h-3.5 transition-transform duration-150",
                                isOpen && "rotate-180",
                              )}
                            />
                          </button>
                        </NavLink>

                        {isOpen && (
                          <div className="mt-0.5 space-y-1">
                            {subItems.length === 0 ? (
                              <p className="px-3 py-1.5 text-xs text-muted-foreground/50 select-none">
                                No {label.toLowerCase()} yet
                              </p>
                            ) : (
                              subItems.map((item) => (
                                <NavLink
                                  key={item.key}
                                  to={item.to}
                                  className={({ isActive }) =>
                                    cn(
                                      "flex items-center gap-2 rounded px-3 py-1.5 text-xs transition-colors",
                                      isActive
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )
                                  }
                                >
                                  <BoardTypeIcon
                                    board_type={item.board_type}
                                    size="xs"
                                  />
                                  <span className="flex-1 truncate">{item.label}</span>
                                </NavLink>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors active:scale-[0.98]",
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
