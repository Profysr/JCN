import { useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { resolvedNavGroups, workspaceUrl } from "@/lib/navLinks";
import { useInboxUnreadCount } from "@/hooks/useInbox";
import { useBoards } from "@/hooks/useProjects";
import UserPanel from "@/components/layout/UserPanel";

const BOARD_COLORS = {
  SOFTWARE:   "bg-blue-500",
  MARKETING:  "bg-pink-500",
  OPERATIONS: "bg-orange-500",
  CLIENT:     "bg-green-500",
  HR:         "bg-purple-500",
  DESIGN:     "bg-rose-500",
  GENERAL:    "bg-slate-400",
};

export default function Sidebar({
  workspace,
  workspaceId,
  user,
  isFocusMode,
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

  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // Map each collapsible nav key to its dynamic sub-items
  const subItemsMap = {
    boards: boards.map((b) => ({
      key: b.id,
      to: `/w/${workspaceId}/boards/${b.id}`,
      label: b.name,
      colorClass: BOARD_COLORS[b.board_type?.toUpperCase()] ?? BOARD_COLORS.GENERAL,
    })),
  };

  const navGroups = resolvedNavGroups().map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      to: workspaceUrl(workspaceId, item.path),
      icon: item.icon,
      label: item.label,
      key: item.key,
      end: item.end ?? false,
      collapsible: item.collapsible ?? false,
    })),
  }));

  return (
    <aside
      className="w-64 flex-shrink-0 border-r flex flex-col"
      style={{ background: "hsl(var(--sidebar-bg))" }}
    >
      {/* Search / command palette */}
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

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto">
        {navGroups.map((group, gi) => (
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
                                    "flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors",
                                    isActive
                                      ? "bg-primary/10 text-primary font-medium"
                                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                  )
                                }
                              >
                                <span
                                  className={cn(
                                    "w-2 h-2 rounded-sm flex-shrink-0",
                                    item.colorClass,
                                  )}
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
        ))}
      </nav>

      {/* User panel */}
      <UserPanel
        user={user}
        workspace={workspace}
        workspaceId={workspaceId}
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
