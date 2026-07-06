import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { notificationUrl } from "@/shared/lib/notificationNav";
import {
  useInbox,
  useUpdateInboxItem,
  useBulkUpdateInbox,
  useHasUnreadNotifications,
  useNotificationVerbMeta,
} from "@/shared/hooks/useInbox";
import { usePermissions } from "@/shared/hooks/usePermissions";
import { APP_DEFS } from "@/shared/lib/navLinks";
import { EmptyState } from "@/shared/components/ui/empty-state";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";

import {
  Bell,
  CheckCheck,
  Activity,
  UserPlus,
  MessageSquare,
  AtSign,
  ShieldCheck,
  ListPlus,
  CheckCircle2,
  Rocket,
  Flag,
  CalendarClock,
  CalendarCheck2,
  CalendarX2,
  RefreshCw,
  FileWarning,
  MapPin,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { Loader } from "../ui/Loader";

const ICON_MAP = {
  "user-plus": UserPlus,
  "message-square": MessageSquare,
  "at-sign": AtSign,
  "shield-check": ShieldCheck,
  "list-plus": ListPlus,
  "check-circle-2": CheckCircle2,
  rocket: Rocket,
  flag: Flag,
  "calendar-clock": CalendarClock,
  "calendar-check-2": CalendarCheck2,
  "calendar-x-2": CalendarX2,
  "refresh-cw": RefreshCw,
  "file-warning": FileWarning,
  "map-pin": MapPin,
  clock: Clock,
};

const fallbackMeta = (verb) => ({
  label: (verb || "updated").replace(/_/g, " "),
  icon: Activity,
  tone: "text-muted-foreground",
});

function buildVerbMeta(rawVerbs) {
  const meta = {};
  for (const [verb, v] of Object.entries(rawVerbs || {})) {
    // The backend sends an icon NAME; we map it to a lucide component here. A
    // name we don't know still renders (generic Activity icon) but that's a
    // silent degrade — warn in dev so adding a new icon name to a verb without
    // adding it to ICON_MAP gets noticed.
    if (v.icon && !ICON_MAP[v.icon] && import.meta.env.DEV) {
      console.warn(
        `[NotificationBell] verb "${verb}" uses icon "${v.icon}" which is not in ICON_MAP — falling back to a generic icon. Add it to ICON_MAP.`,
      );
    }
    meta[verb] = {
      label: v.label,
      icon: ICON_MAP[v.icon] || Activity,
      tone: v.tone || "text-muted-foreground",
    };
  }
  return meta;
}

/* ==========================================
   1. TRIGGER BUTTON
   ========================================== */
function NotificationTrigger({ open, onClick, hasUnread }) {
  return (
    <button
      data-tour="notification_bell"
      onClick={onClick}
      className={cn(
        "relative p-1.5 rounded-md transition-colors",
        open
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      aria-label="Notifications"
    >
      <Bell className="w-4 h-4" />
      {hasUnread && (
        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-[hsl(var(--sidebar-bg))]" />
      )}
    </button>
  );
}

/* ==========================================
   2. POPPING PANEL HEADER 
   ========================================== */
function NotificationHeader({
  unreadCount,
  onMarkAllRead,
  isPending,
  filters,
  activeFilter,
  onFilterChange,
  totalItems,
}) {
  return (
    <div className="px-4 pt-3 pb-2.5 border-b border-border">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5 leading-none">
              {unreadCount} new
            </span>
          )}
        </div>
        <button
          onClick={onMarkAllRead}
          disabled={unreadCount === 0 || isPending}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:hover:text-muted-foreground"
        >
          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
        </button>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {filters.map((f) => {
          // App tabs scope the fetch itself (see `app` query param), so there's
          // no cheap accurate count to show without an extra request per app —
          // only "All"/"Unread" (drawn from the already-loaded list) get a badge.
          const count = f.key === "unread" ? unreadCount : f.app ? null : totalItems;
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={cn(
                "text-xs font-medium px-2.5 py-1 rounded-md transition-colors",
                activeFilter === f.key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {f.label}
              {count > 0 && (
                <span className="ml-1 text-[10px] opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================
   3. SINGLE NOTIFICATION ROW
   ========================================== */
function NotificationItem({ item, verbMeta, onClick }) {
  const meta = verbMeta[item.verb] || fallbackMeta(item.verb);
  const VerbIcon = meta.icon;

  return (
    <button
      onClick={() => onClick(item)}
      className={cn(
        "w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent text-left transition-colors",
        item.status === "unread" && "bg-primary/5",
      )}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar name={item.actor_name || "?"} size="sm" />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-popover flex items-center justify-center">
          <VerbIcon className={cn("w-3 h-3", meta.tone)} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug break-words">
          <span className="font-semibold">{item.actor_name}</span>{" "}
          <span className="text-muted-foreground">{meta.label}</span>{" "}
          <span className="font-medium">&quot;{item.resource_name}&quot;</span>
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
        </p>
      </div>
      {item.status === "unread" && (
        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
      )}
    </button>
  );
}

/* ==========================================
   MAIN COMPONENT
   ========================================== */
const BASE_FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
];

// "workspace" is a frontend-only pseudo-app (workspace settings) — it never produces notifications, so it never gets a tab here.
const NOTIFYING_APPS = APP_DEFS.filter((a) => a.key !== "workspace");

export default function NotificationBell() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // 1. Set "unread" as the default tab view
  const [filter, setFilter] = useState("unread");
  const [expanded, setExpanded] = useState(false);
  const ref = useRef(null);

  const limit = expanded ? 50 : 20;
  const isAppFilter = !["all", "unread"].includes(filter);

  const { data: rawVerbMeta } = useNotificationVerbMeta();
  const verbMeta = useMemo(() => buildVerbMeta(rawVerbMeta), [rawVerbMeta]);

  const { data: permissions } = usePermissions(workspaceId);
  const appTabs = useMemo(
    () =>
      NOTIFYING_APPS.filter((a) => permissions?.apps?.[a.key]).map((a) => ({
        key: a.key,
        label: a.shortLabel,
        app: true,
      })),
    [permissions],
  );
  const filters = useMemo(() => [...BASE_FILTERS, ...appTabs], [appTabs]);

  // Unscoped fetch — powers the "All"/"Unread" tabs.
  const unscoped = useInbox(workspaceId, {
    tab: "for_you",
    limit,
    enabled: open && !isAppFilter,
  });

  const scoped = useInbox(workspaceId, {
    tab: "for_you",
    limit,
    app: isAppFilter ? filter : undefined,
    enabled: open && isAppFilter,
  });

  const active = isAppFilter ? scoped : unscoped;
  const items = active.data || [];
  const isLoading = active.isLoading;
  const isFetching = active.isFetching;

  const hasUnread = useHasUnreadNotifications(workspaceId);
  const updateItem = useUpdateInboxItem(workspaceId);
  const bulkUpdate = useBulkUpdateInbox(workspaceId);

  // Derive from the fresh items list so the panel header count always matches what's actually displayed — no extra fetch, items are already loaded on open.
  const panelUnreadCount = useMemo(
    () => items.filter((i) => i.status === "unread").length,
    [items],
  );

  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  useEffect(() => {
    setExpanded(false);
  }, [filter]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // custom event to open toggle notification
  useEffect(() => {
    const handler = () => setOpen((o) => !o);
    window.addEventListener("jcn:toggle-notifications", handler);
    return () => window.removeEventListener("jcn:toggle-notifications", handler);
  }, []);

  const visible = useMemo(
    () =>
      filter === "unread" ? items.filter((i) => i.status === "unread") : items,
    [items, filter],
  );

  const grouped = useMemo(
    () =>
      visible.reduce((acc, item) => {
        const appDef = NOTIFYING_APPS.find((a) => a.key === item.app);
        const key = `${appDef?.label || "Workspace"} >> ${item.board_name || "General"}`;
        (acc[key] ||= []).push(item);
        return acc;
      }, {}),
    [visible],
  );

  const handleItemClick = (item) => {
    if (item.status === "unread")
      updateItem.mutate({ id: item.id, status: "read" });
    setOpen(false);
    const url = notificationUrl(item.meta);
    if (url) navigate(url);
  };

  const handleMarkAllRead = () => {
    const ids = items.filter((i) => i.status === "unread").map((i) => i.id);
    if (ids.length) bulkUpdate.mutate({ ids, action: "read" });
  };

  // Conditions for pagination vs cap warnings
  const atInitialLimit = items.length === limit && !expanded;

  // 2. Identify if we hit the absolute backend hard cap of 50 items
  const hitBackendMaxCap = items.length === 50 && expanded;

  return (
    <div className="relative" ref={ref}>
      <NotificationTrigger
        open={open}
        onClick={() => setOpen((o) => !o)}
        hasUnread={hasUnread}
      />

      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-[360px] bg-popover border border-border rounded-md shadow-popover overflow-hidden animate-scale-in origin-bottom-left">
          <NotificationHeader
            unreadCount={panelUnreadCount}
            onMarkAllRead={handleMarkAllRead}
            isPending={bulkUpdate.isPending}
            filters={filters}
            activeFilter={filter}
            onFilterChange={setFilter}
            totalItems={items.length}
          />

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <Loader className="h-[200px]" />
            ) : visible.length === 0 ? (
              <EmptyState
                illustration="notifications"
                title={
                  filter === "unread"
                    ? "No unread notifications"
                    : "You're all caught up"
                }
                description={
                  filter === "unread"
                    ? "You're all read up here."
                    : "Nothing for you here right now."
                }
                className="py-10"
              />
            ) : (
              <>
                {Object.entries(grouped).map(([projectName, projectItems]) => (
                  <div key={projectName}>
                    <div className="flex items-center justify-between px-4 py-1.5 bg-muted/40 sticky top-0 backdrop-blur-sm z-10">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                        {projectName}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                        {
                          projectItems.filter((i) => i.status === "unread")
                            .length
                        }{" "}
                        unread
                      </span>
                    </div>

                    {projectItems.map((item) => (
                      <NotificationItem
                        key={item.id}
                        item={item}
                        verbMeta={verbMeta}
                        onClick={handleItemClick}
                      />
                    ))}
                  </div>
                ))}

                {/* Show "View More" if we are sitting at the initial 20 items */}
                {atInitialLimit && (
                  <LoadMoreButton
                    variant="row"
                    label="View more notifications"
                    isLoading={isFetching}
                    onClick={() => setExpanded(true)}
                  />
                )}

                {/* 3. Message banner when hitting the absolute 50 notification backend ceiling */}
                {hitBackendMaxCap && filter === "unread" && (
                  <div className="px-4 py-3 bg-muted/60 border-t border-border text-center">
                    <p className="text-[11px] text-muted-foreground leading-normal">
                      Showing the maximum 50 unread notifications.
                      <br />
                      <span className="font-medium text-foreground">
                        Mark these as read
                      </span>{" "}
                      to view older notifications.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
