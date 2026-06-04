import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bell, ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useInbox, useUpdateInboxItem, useInboxUnreadCount } from "@/hooks/useInbox";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const VERB_LABELS = {
  task_assigned:      "assigned you to",
  task_commented:     "commented on",
  task_mentioned:     "mentioned you in",
  approval_requested: "requested approval on",
};

export default function NotificationBell() {
  const navigate            = useNavigate();
  const { workspaceSlug }   = useParams();
  const [open, setOpen]     = useState(false);
  const ref                 = useRef(null);

  const { data: items = [] } = useInbox(workspaceSlug, { tab: "for_you" });
  const unreadCount          = useInboxUnreadCount(workspaceSlug);
  const updateItem           = useUpdateInboxItem(workspaceSlug);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Group by project_name
  const grouped = items.reduce((acc, item) => {
    const key = item.project_name || "General";
    (acc[key] ||= []).push(item);
    return acc;
  }, {});

  const handleItemClick = (item) => {
    if (item.status === "unread") {
      updateItem.mutate({ id: item.id, status: "read" });
    }
    navigate(
      `/w/${item.meta?.workspace_slug || workspaceSlug}/projects/${item.meta?.project_id}?task=${item.meta?.task_id}`,
    );
    setOpen(false);
  };

  const handleViewAll = () => {
    navigate(`/w/${workspaceSlug}/inbox`);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 bottom-full mb-2 z-50 w-[340px] bg-card border rounded-xl shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <button
              onClick={handleViewAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                All caught up — no new notifications
              </div>
            ) : (
              Object.entries(grouped).map(([projectName, projectItems]) => (
                <div key={projectName}>
                  {/* Project group header */}
                  <div className="flex items-center justify-between px-4 py-1.5 bg-muted/30 sticky top-0">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate">
                      {projectName}
                    </span>
                    <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
                      {projectItems.filter((i) => i.status === "unread").length} unread
                    </span>
                  </div>

                  {projectItems.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent text-left transition-colors",
                        item.status === "unread" && "bg-primary/4",
                      )}
                    >
                      <Avatar name={item.actor_name || "?"} size="xs" className="flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-snug break-words">
                          <span className="font-semibold">{item.actor_name}</span>
                          {" "}
                          <span className="text-muted-foreground">{VERB_LABELS[item.verb] || item.verb}</span>
                          {" "}
                          <span className="font-medium">"{item.resource_name}"</span>
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {item.status === "unread" && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                      )}
                    </button>
                  ))}

                  {projectItems.length > 4 && (
                    <button
                      onClick={handleViewAll}
                      className="w-full text-xs text-muted-foreground hover:text-foreground px-4 py-1.5 text-left transition-colors"
                    >
                      +{projectItems.length - 4} more in {projectName}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
