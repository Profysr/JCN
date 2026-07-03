import { useState, useMemo } from "react";
import { Loader } from "@/shared/components/ui/Loader";
import { useNavigate } from "react-router-dom";
import { useMyWork } from "@/shared/hooks/useMyWork";
import { Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getPriority, pickColor } from "@/shared/lib/constants";
import { formatShortDate } from "@/shared/lib/dateUtils";

// ── Urgency bucketing ─────────────────────────────────────────────────────────
function sectionFor(task) {
  if (!task.due_date) return "no_date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + 7);
  const d = new Date(task.due_date + "T00:00:00");
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  if (d <= weekEnd) return "this_week";
  return "later";
}

const SECTIONS = [
  {
    id: "overdue",
    label: "Overdue",
    headerCls: "text-red-500",
    countCls: "bg-red-500/10 text-red-500",
  },
  {
    id: "today",
    label: "Due Today",
    headerCls: "text-orange-500",
    countCls: "bg-orange-500/10 text-orange-500",
  },
  {
    id: "this_week",
    label: "This Week",
    headerCls: "text-foreground",
    countCls: "bg-muted text-muted-foreground",
  },
  {
    id: "later",
    label: "Later",
    headerCls: "text-muted-foreground",
    countCls: "bg-muted text-muted-foreground",
  },
  {
    id: "no_date",
    label: "No Due Date",
    headerCls: "text-muted-foreground",
    countCls: "bg-muted text-muted-foreground",
  },
];

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, sectionId, onOpen }) {
  const p = getPriority(task.priority);
  const Icon = p.icon;
  const color = pickColor(task.board_name);
  const status = task.status_detail;
  const isOverdue = sectionId === "overdue";

  return (
    <div
      onClick={() => onOpen(task)}
      className="group flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors rounded-lg"
    >
      {/* Priority icon */}
      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", p.textCls)} />

      {/* Task title */}
      <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary transition-colors">
        {task.title}
      </span>

      {/* Project badge */}
      {task.board_name && (
        <span
          className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: color + "18", color }}
        >
          {task.board_name}
        </span>
      )}

      {/* Status chip */}
      {status && (
        <span
          className="flex-shrink-0 text-[11px] font-medium px-2 py-0.5 rounded hidden sm:inline"
          style={{ backgroundColor: status.color + "20", color: status.color }}
        >
          {status.name}
        </span>
      )}

      {/* Due date */}
      {task.due_date && (
        <span
          className={cn(
            "flex-shrink-0 flex items-center gap-1 text-[11px] font-medium",
            isOverdue ? "text-red-500" : "text-muted-foreground",
          )}
        >
          <Calendar className="w-3 h-3" />
          {formatShortDate(task.due_date)}
        </span>
      )}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ id, label, headerCls, countCls, tasks, onOpen }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-1">
      {/* Section header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-accent/40 transition-colors group"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            headerCls,
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-0.5",
            countCls,
          )}
        >
          {tasks.length}
        </span>
      </button>

      {/* Task rows */}
      {open && (
        <div className="mt-0.5">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} sectionId={id} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MyWorkPage() {
  const navigate = useNavigate();
  const { data: tasks = [], isLoading } = useMyWork();

  const grouped = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        tasks: tasks.filter((t) => sectionFor(t) === s.id),
      })).filter((s) => s.tasks.length > 0),
    [tasks],
  );

  const handleOpen = (task) => {
    if (task.workspace_id && task.board_id) {
      navigate(
        `/w/${task.workspace_id}/boards/${task.board_id}?task=${task.id}`,
      );
    }
  };

  if (isLoading) return <Loader className="flex-1" />;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bold text-base">My Work</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tasks assigned to you across all projects
            </p>
          </div>
          {tasks.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Quick stats */}
        {tasks.length > 0 && (
          <div className="flex items-center gap-3 mt-3">
            {SECTIONS.filter(
              (s) => tasks.filter((t) => sectionFor(t) === s.id).length > 0,
            ).map((s) => {
              const count = tasks.filter((t) => sectionFor(t) === s.id).length;
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      {
                        overdue: "bg-red-500",
                        today: "bg-orange-500",
                        this_week: "bg-primary",
                        later: "bg-muted-foreground",
                        no_date: "bg-muted-foreground/50",
                      }[s.id],
                    )}
                  />
                  <span className="text-xs text-muted-foreground">
                    {count} {s.label.toLowerCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-14 h-14 rounded--md bg-muted flex items-center justify-center text-2xl mb-4">
              🎉
            </div>
            <p className="font-semibold text-foreground">
              You&apos;re all caught up!
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              No tasks assigned to you right now.
            </p>
          </div>
        ) : (
          grouped.map((s) => (
            <Section
              key={s.id}
              id={s.id}
              label={s.label}
              headerCls={s.headerCls}
              countCls={s.countCls}
              tasks={s.tasks}
              onOpen={handleOpen}
            />
          ))
        )}
      </div>
    </div>
  );
}
