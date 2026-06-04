import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import {
  Bell,
  Check,
  Archive,
  Clock,
  Filter,
  ChevronDown,
  CheckSquare,
  Square,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import {
  useInbox,
  useUpdateInboxItem,
  useBulkUpdateInbox,
  snoozeUntil,
} from "@/hooks/useInbox";

const TABS = [
  { id: "for_you", label: "For You" },
  { id: "all", label: "All" },
  { id: "done", label: "Done" },
];

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "assigned", label: "Assigned" },
  { value: "mentioned", label: "Mentioned" },
  { value: "commented", label: "Commented" },
  { value: "approved", label: "Approval" },
  { value: "automated", label: "Automated" },
];

const VERB_LABELS = {
  task_assigned: "assigned you to",
  task_commented: "commented on",
  task_mentioned: "mentioned you in",
  approval_requested: "requested your approval on",
};

const SNOOZE_PRESETS = [
  { id: "1h", label: "1 hour" },
  { id: "tomorrow", label: "Tomorrow 9am" },
  { id: "next_week", label: "Next week" },
];

export default function InboxPage() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState("for_you");
  const [eventFilter, setEventFilter] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [snoozeOpen, setSnoozeOpen] = useState(null); // item id

  const { data: items = [], isLoading } = useInbox(workspaceSlug, {
    tab,
    eventType: eventFilter || undefined,
  });
  const update = useUpdateInboxItem(workspaceSlug);
  const bulkUpdate = useBulkUpdateInbox(workspaceSlug);

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const markRead = (id) => update.mutate({ id, status: "read" });
  const archive = (id) => update.mutate({ id, status: "archived" });
  const snooze = (id, preset) => {
    update.mutate({
      id,
      status: "snoozed",
      snoozed_until: snoozeUntil(preset),
    });
    setSnoozeOpen(null);
  };

  const bulkAction = (action) => {
    if (!selected.size) return;
    const payload = { ids: [...selected], action };
    if (action === "snooze") return; // handled via snooze picker
    bulkUpdate.mutate(payload, { onSuccess: () => setSelected(new Set()) });
  };

  const openTask = (item) => {
    if (
      item.meta?.workspace_slug &&
      item.meta?.project_id &&
      item.meta?.task_id
    ) {
      navigate(
        `/w/${item.meta.workspace_slug}/projects/${item.meta.project_id}?task=${item.meta.task_id}`,
      );
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")
        return;
      if (e.key === "e" && selected.size) bulkAction("archive");
      if (e.key === "m" && selected.size) bulkAction("read");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-bold text-base">Inbox</h1>
        </div>

        {/* Event type filter */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="text-xs border border-border rounded-md px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring pr-6 appearance-none"
            >
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 px-6 border-b flex-shrink-0 bg-background">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setSelected(new Set());
            }}
            className={cn(
              "px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "for_you" &&
              items.filter((i) => i.status === "unread").length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                  {items.filter((i) => i.status === "unread").length}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-6 py-2 bg-primary/5 border-b flex-shrink-0">
          <span className="text-xs text-muted-foreground font-medium">
            {selected.size} selected
          </span>
          <div className="flex gap-1.5 ml-auto">
            <button
              onClick={() => bulkAction("read")}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-card border border-border hover:bg-accent transition-colors"
            >
              <Check className="w-3 h-3" /> Mark done{" "}
              <kbd className="text-[9px] ml-1 opacity-60">m</kbd>
            </button>
            <button
              onClick={() => bulkAction("archive")}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-card border border-border hover:bg-accent transition-colors"
            >
              <Archive className="w-3 h-3" /> Archive{" "}
              <kbd className="text-[9px] ml-1 opacity-60">e</kbd>
            </button>
          </div>
        </div>
      )}

      {/* Item list */}
      <div className="flex-1 overflow-y-auto divide-y">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {tab === "for_you"
                ? "All caught up! Nothing needs your attention."
                : "Nothing here."}
            </p>
          </div>
        ) : (
          <>
            {/* Select-all row */}
            <div className="flex items-center gap-3 px-6 py-2 bg-muted/20">
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                {allSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                Select all
              </button>
            </div>

            {items.map((item) => (
              <InboxItemRow
                key={item.id}
                item={item}
                isSelected={selected.has(item.id)}
                onToggle={() => toggleOne(item.id)}
                onOpen={() => openTask(item)}
                onMarkRead={() => markRead(item.id)}
                onArchive={() => archive(item.id)}
                snoozeOpen={snoozeOpen === item.id}
                onSnoozeOpen={() => setSnoozeOpen(item.id)}
                onSnoozeClose={() => setSnoozeOpen(null)}
                onSnooze={(preset) => snooze(item.id, preset)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function InboxItemRow({
  item,
  isSelected,
  onToggle,
  onOpen,
  onMarkRead,
  onArchive,
  snoozeOpen,
  onSnoozeOpen,
  onSnoozeClose,
  onSnooze,
}) {
  const isUnread = item.status === "unread";

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-6 py-3.5 hover:bg-accent/40 transition-colors relative",
        isUnread && "bg-primary/3",
        isSelected && "bg-primary/8",
      )}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex-shrink-0 mt-0.5"
      >
        {isSelected ? (
          <CheckSquare className="w-4 h-4 text-primary" />
        ) : (
          <Square className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground" />
        )}
      </button>

      {/* Unread dot */}
      <div className="flex-shrink-0 mt-1.5 w-2">
        {isUnread && <span className="block w-2 h-2 rounded-full bg-primary" />}
      </div>

      {/* Avatar */}
      <Avatar
        name={item.actor_name || "?"}
        size="sm"
        className="flex-shrink-0 mt-0.5"
      />

      {/* Content */}
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <p className="text-sm leading-snug break-words">
          <span className="font-semibold text-foreground">
            {item.actor_name}
          </span>{" "}
          <span className="text-muted-foreground">
            {VERB_LABELS[item.verb] || item.verb}
          </span>{" "}
          <span className="font-medium text-foreground">
            "{item.resource_name}"
          </span>
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {item.project_name && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {item.project_name}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(item.created_at), {
              addSuffix: true,
            })}
          </span>
        </div>
      </button>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {isUnread && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
            title="Mark done (m)"
            className="p-1.5 rounded-md hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-600 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onArchive();
          }}
          title="Archive (e)"
          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        >
          <Archive className="w-3.5 h-3.5" />
        </button>

        {/* Snooze */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              snoozeOpen ? onSnoozeClose() : onSnoozeOpen();
            }}
            title="Snooze"
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
          {snoozeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={onSnoozeClose} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-xl shadow-popover py-1 w-40">
                {SNOOZE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSnooze(p.id);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors flex items-center gap-2"
                  >
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    {p.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
