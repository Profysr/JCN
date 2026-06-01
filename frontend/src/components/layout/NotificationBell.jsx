import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNotifications, useMarkNotificationRead } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const VERB_LABELS = {
  task_assigned:  "assigned you to",
  task_commented: "commented on",
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkNotificationRead();

  const unread = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = (n) => {
    if (!n.read) markRead.mutate({ id: n.id });
    navigate(`/w/${n.meta.workspace_slug}/projects/${n.meta.project_id}?task=${n.meta.task_id}`);
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
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 z-50 w-80 bg-card border rounded-xl shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate({})}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto divide-y">
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 hover:bg-accent text-left transition-colors",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {(n.actor?.full_name || n.actor?.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs leading-relaxed break-words">
                      <span className="font-semibold text-foreground">
                        {n.actor?.full_name || n.actor?.email}
                      </span>{" "}
                      {VERB_LABELS[n.verb] || n.verb}{" "}
                      <span className="font-medium text-foreground">
                        "{n.meta?.task_title}"
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
