import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  CheckCircle2,
  ArrowRight,
  Target,
  Bell,
  CheckCheck,
  UserPlus,
  MessageSquare,
  AtSign,
  ShieldCheck,
  Activity,
  Flame,
  FolderKanban,
  Inbox,
  BarChart2,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/shared/lib/utils";
import { useMyWork } from "@/shared/hooks/useMyWork";
import { useBoards } from "@/apps/project-management/hooks/useBoards";
import { useObjectives, CONFIDENCE_CONFIG } from "@/shared/hooks/useGoals";
import {
  useInbox,
  useHasUnreadNotifications,
  useBulkUpdateInbox,
  useUpdateInboxItem,
} from "@/shared/hooks/useInbox";
import { notificationUrl } from "@/shared/lib/notificationNav";
import { useAuthStore } from "@/store/authStore";
import { getPriority, pickColor, URGENCY_SECTIONS } from "@/shared/lib/constants";
import { formatShortDate, getTaskUrgency } from "@/shared/lib/dateUtils";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import { Avatar } from "@/shared/components/ui/avatar";
import GettingStartedChecklist from "@/apps/project-management/components/GettingStartedChecklist";
import { Loader } from "@/shared/components/ui/Loader";

function greetingFor(name) {
  const h = new Date().getHours();
  const salutation =
    h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return name ? `${salutation}, ${name.split(" ")[0]}` : salutation;
}

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onOpen }) {
  const bucket = getTaskUrgency(task);
  const p = getPriority(task.priority);
  const PIcon = p.icon;
  const color = pickColor(task.board_name);
  const status = task.status_detail;

  return (
    <div
      onClick={() => onOpen(task)}
      className="group flex items-center gap-2.5 px-3 py-2 hover:bg-accent/50 cursor-pointer transition-colors rounded-md"
    >
      <PIcon className={cn("w-3 h-3 flex-shrink-0", p.textCls)} />
      <span className="flex-1 text-sm truncate group-hover:text-primary transition-colors">
        {task.title}
      </span>
      {task.board_name && (
        <span
          className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full hidden sm:inline"
          style={{ backgroundColor: color + "18", color }}
        >
          {task.board_name}
        </span>
      )}
      {status && (
        <span
          className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded hidden md:inline"
          style={{ backgroundColor: status.color + "20", color: status.color }}
        >
          {status.name}
        </span>
      )}
      {task.due_date && (
        <span
          className={cn(
            "flex-shrink-0 flex items-center gap-1 text-[10px] font-medium",
            bucket === "overdue" ? "text-red-500" : "text-muted-foreground",
          )}
        >
          <Calendar className="w-2.5 h-2.5" />
          {formatShortDate(task.due_date)}
        </span>
      )}
    </div>
  );
}

// ── My Tasks widget ───────────────────────────────────────────────────────────
function MyTasksWidget({ tasks, workspaceId }) {
  const navigate = useNavigate();

  const handleOpen = (task) => {
    if (task.workspace_id && task.board_id)
      navigate(
        `/w/${task.workspace_id}/boards/${task.board_id}?task=${task.id}`,
      );
  };

  const sections = useMemo(
    () =>
      URGENCY_SECTIONS.map((s) => ({
        ...s,
        tasks: tasks.filter((t) => getTaskUrgency(t) === s.id).slice(0, 6),
      })).filter((s) => s.tasks.length > 0),
    [tasks],
  );

  return (
    <div className="bg-card border border-border rounded-md shadow-card flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">My Tasks</h2>
          {tasks.length > 0 && (
            <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
              {tasks.length}
            </span>
          )}
        </div>
        <button
          onClick={() => navigate(`/w/${workspaceId}/my-work`)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center px-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mb-3" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">
            No tasks assigned to you right now.
          </p>
        </div>
      ) : (
        <div className="p-2 space-y-3 overflow-auto">
          {sections.map((s) => (
            <div key={s.id}>
              <div className="flex items-center gap-2 px-3 py-1">
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                    s.dot,
                  )}
                />
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    s.headerCls,
                  )}
                >
                  {s.label}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({s.tasks.length})
                </span>
              </div>
              {s.tasks.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={handleOpen} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── My Boards widget (card grid) ──────────────────────────────────────────────
function MyBoardsWidget({ boards, workspaceId }) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-md shadow-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="text-sm font-semibold">My Boards</h2>
        <button
          onClick={() => navigate(`/w/${workspaceId}/boards`)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {boards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <p className="text-sm text-muted-foreground">
            No boards yet — create your first board.
          </p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {boards.slice(0, 6).map((b) => {
            const done = b.done_task_count || 0;
            const total = b.task_count || 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={b.id}
                onClick={() => navigate(`/w/${workspaceId}/boards/${b.id}`)}
                className="text-left p-4 rounded-md border border-border hover:border-primary/40 hover:bg-accent/40 transition-all group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <BoardTypeIcon
                    board_type={b.board_type}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                      {b.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {done} / {total} task{total !== 1 ? "s" : ""} done
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-right tabular-nums">
                    {pct}% complete
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Goals widget ──────────────────────────────────────────────────────────────
function GoalsWidget({ workspaceId }) {
  const navigate = useNavigate();
  const { data: objectives = [] } = useObjectives(workspaceId);
  const top = objectives.slice(0, 5);

  return (
    <div className="bg-card border border-border rounded-md shadow-card h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Goals & OKRs</h2>
        </div>
        <button
          onClick={() => navigate(`/w/${workspaceId}/goals`)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      {top.length === 0 ? (
        <button
          onClick={() => navigate(`/w/${workspaceId}/goals`)}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-8 transition-colors"
        >
          No goals yet — create your first objective →
        </button>
      ) : (
        <div className="p-4 space-y-4">
          {top.map((obj) => {
            const cfg =
              CONFIDENCE_CONFIG[obj.confidence] || CONFIDENCE_CONFIG.on_track;
            return (
              <div key={obj.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium truncate">
                    {obj.title}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2",
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    {obj.progress}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${obj.progress}%`,
                      backgroundColor:
                        obj.confidence === "on_track"
                          ? "#22c55e"
                          : obj.confidence === "at_risk"
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Notifications widget ──────────────────────────────────────────────────────
const VERB_META = {
  task_assigned: {
    label: "assigned you to",
    Icon: UserPlus,
    tone: "text-indigo-500",
  },
  task_commented: {
    label: "commented on",
    Icon: MessageSquare,
    tone: "text-sky-500",
  },
  task_mentioned: {
    label: "mentioned you in",
    Icon: AtSign,
    tone: "text-violet-500",
  },
  approval_requested: {
    label: "requested approval on",
    Icon: ShieldCheck,
    tone: "text-amber-500",
  },
};

function verbMeta(verb) {
  return (
    VERB_META[verb] ?? {
      label: (verb || "updated").replace(/_/g, " "),
      Icon: Activity,
      tone: "text-muted-foreground",
    }
  );
}

function NotificationRow({ item, onItemClick }) {
  const { label, Icon, tone } = verbMeta(item.verb);
  return (
    <button
      onClick={() => onItemClick(item)}
      className={cn(
        "w-full flex items-start gap-2.5 px-4 py-2.5 hover:bg-accent/50 text-left transition-colors",
        item.status === "unread" && "bg-primary/5",
      )}
    >
      <div className="relative flex-shrink-0 mt-0.5">
        <Avatar name={item.actor_name || "?"} size="sm" />
        <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-card border border-border flex items-center justify-center">
          <Icon className={cn("w-2.5 h-2.5", tone)} />
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs leading-snug">
          <span className="font-semibold">{item.actor_name}</span>{" "}
          <span className="text-muted-foreground">{label}</span>{" "}
          <span className="font-medium">"{item.resource_name}"</span>
        </p>
        {item.board_name && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
            {item.board_name}
          </p>
        )}
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

function RecentNotificationsWidget({ workspaceId }) {
  const navigate = useNavigate();
  const { data: items = [], isLoading } = useInbox(workspaceId, { limit: 10 });
  const hasUnread = useHasUnreadNotifications(workspaceId);
  const updateItem = useUpdateInboxItem(workspaceId);
  const bulkUpdate = useBulkUpdateInbox(workspaceId);

  const handleItemClick = (item) => {
    if (item.status === "unread")
      updateItem.mutate({ id: item.id, status: "read" });
    const url = notificationUrl(item.meta);
    if (url) navigate(url);
  };

  const visibleUnreadIds = items
    .filter((i) => i.status === "unread")
    .map((i) => i.id);

  const handleMarkAllRead = () => {
    if (visibleUnreadIds.length)
      bulkUpdate.mutate({ ids: visibleUnreadIds, action: "read" });
  };

  return (
    <div className="bg-card border border-border rounded-md shadow-card h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Notifications</h2>
          {hasUnread && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          )}
        </div>
        {visibleUnreadIds.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={bulkUpdate.isPending}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? (
        <Loader className="py-8" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Bell className="w-8 h-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">
            No notifications yet.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/60 max-h-96 overflow-y-auto">
          {items.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              onItemClick={handleItemClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Urgent Tasks card ─────────────────────────────────────────────────────────
function UrgentTasksCard({ overdue, today, workspaceId }) {
  const navigate = useNavigate();

  const handleOpen = (task) => {
    if (task.workspace_id && task.board_id)
      navigate(
        `/w/${task.workspace_id}/boards/${task.board_id}?task=${task.id}`,
      );
  };

  if (overdue.length === 0 && today.length === 0) return null;

  return (
    <div className="border border-red-300 dark:border-red-800 rounded-md overflow-hidden shadow-card">
      {/* Card header */}
      <div className="flex items-center justify-between px-5 py-3 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-red-500" />
          <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
            Needs Attention
          </h2>
          <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none">
            {overdue.length + today.length}
          </span>
        </div>
        <button
          onClick={() => navigate(`/w/${workspaceId}/my-work`)}
          className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="w-3 h-3" />
        </button>
      </div>

      <div className="bg-card">
        {/* Overdue section */}
        {overdue.length > 0 && (
          <div>
            <div className="flex items-center gap-2 px-5 py-2 border-b border-border bg-red-500/5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-red-500">
                Overdue — {overdue.length} task{overdue.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="px-2 py-1">
              {overdue.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={handleOpen} />
              ))}
            </div>
          </div>
        )}

        {/* Due today section */}
        {today.length > 0 && (
          <div className={overdue.length > 0 ? "border-t border-border" : ""}>
            <div className="flex items-center gap-2 px-5 py-2 border-b border-border bg-orange-500/5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-500">
                Due Today — {today.length} task{today.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="px-2 py-1">
              {today.map((t) => (
                <TaskRow key={t.id} task={t} onOpen={handleOpen} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick Links widget (fills the right half of the Goals row) ────────────────
const QUICK_LINKS = [
  {
    label: "My Work",
    desc: "Tasks assigned to you",
    icon: Inbox,
    path: "my-work",
  },
  {
    label: "Boards",
    desc: "All project boards",
    icon: FolderKanban,
    path: "boards",
  },
  { label: "Goals", desc: "OKRs & objectives", icon: Target, path: "goals" },
  {
    label: "Analytics",
    desc: "Velocity, flow & team metrics",
    icon: BarChart2,
    path: "analytics",
  },
];

function QuickLinksWidget({ workspaceId }) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-md shadow-card h-full flex flex-col">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <ExternalLink className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Quick Links</h2>
      </div>

      <div className="divide-y divide-border flex-1">
        {QUICK_LINKS.map(({ label, desc, icon: Icon, path }) => (
          <button
            key={path}
            onClick={() => navigate(`/w/${workspaceId}/${path}`)}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-accent/50 transition-colors text-left group"
          >
            <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
              <Icon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium group-hover:text-primary transition-colors">
                {label}
              </p>
              <p className="text-xs text-muted-foreground truncate">{desc}</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto flex-shrink-0 group-hover:text-primary transition-colors" />
          </button>
        ))}
      </div>

      {/* Coming soon footer */}
      <div className="px-5 py-3.5 border-t border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary/60" />
          <p className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              More coming soon
            </span>{" "}
            — custom widgets, reports & integrations
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DashboardsPage() {
  const { workspaceId } = useParams();
  const user = useAuthStore((s) => s.user);
  const { data: tasks = [] } = useMyWork();
  const { data: boards = [] } = useBoards(workspaceId);

  const overdueTasks = useMemo(
    () => tasks.filter((t) => getTaskUrgency(t) === "overdue"),
    [tasks],
  );
  const todayTasks = useMemo(
    () => tasks.filter((t) => getTaskUrgency(t) === "today"),
    [tasks],
  );

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Page header */}
      {/* <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-2 flex-shrink-0">
        <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div> */}

      <div className="p-6 px-3 space-y-2.5">
        {/* Greeting */}
        <div>
          <h2 className="text-xl font-bold">
            {greetingFor(user?.full_name || user?.email)}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {overdueTasks.length > 0
              ? `You have ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""} — let's get them done.`
              : tasks.length > 0
                ? `You have ${tasks.length} task${tasks.length !== 1 ? "s" : ""} across ${boards.length} board${boards.length !== 1 ? "s" : ""}.`
                : "All caught up — great work!"}
          </p>
        </div>

        {/* Getting started checklist */}
        <GettingStartedChecklist workspaceId={workspaceId} />

        {/* Urgent tasks card — overdue + due today */}
        <UrgentTasksCard
          overdue={overdueTasks}
          today={todayTasks}
          workspaceId={workspaceId}
        />

        {/* Row 1: My Tasks (left) + Notifications (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
          <div className="lg:col-span-2">
            <MyTasksWidget tasks={tasks} workspaceId={workspaceId} />
          </div>
          <div>
            <RecentNotificationsWidget workspaceId={workspaceId} />
          </div>
        </div>

        {/* Row 2: My Boards — full width card grid */}
        <MyBoardsWidget boards={boards} workspaceId={workspaceId} />

        {/* Row 3: Goals (left) + Quick Links (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          <GoalsWidget workspaceId={workspaceId} />
          <QuickLinksWidget workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  );
}
