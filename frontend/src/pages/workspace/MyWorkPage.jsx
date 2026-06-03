import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMyWork } from "@/hooks/useMyWork";
import { useUpdateTask } from "@/hooks/useTasks";
import { AlertCircle, ArrowUp, Minus, ArrowDown, Calendar, Check, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

const PRI_ICON = {
  urgent:      { icon: AlertCircle, cls: "text-red-500"    },
  high:        { icon: ArrowUp,     cls: "text-orange-500" },
  medium:      { icon: Minus,       cls: "text-yellow-500" },
  low:         { icon: ArrowDown,   cls: "text-blue-400"   },
  no_priority: { icon: Minus,       cls: "text-muted-foreground/40" },
};

function sectionFor(task) {
  if (!task.due_date) return "no_date";
  const today   = new Date(); today.setHours(0,0,0,0);
  const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
  const d = new Date(task.due_date + "T00:00:00");
  if (d < today)        return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  if (d <= weekEnd)     return "this_week";
  return "later";
}

const SECTIONS = [
  { id: "overdue",   label: "Overdue",       labelCls: "text-red-500"    },
  { id: "today",     label: "Due Today",     labelCls: "text-orange-500" },
  { id: "this_week", label: "This Week",     labelCls: "text-foreground"  },
  { id: "later",     label: "Later",         labelCls: "text-muted-foreground" },
  { id: "no_date",   label: "No Due Date",   labelCls: "text-muted-foreground" },
];

function TaskRow({ task, onComplete, onOpen }) {
  const [completing, setCompleting] = useState(false);
  const p    = PRI_ICON[task.priority] || PRI_ICON.no_priority;
  const Icon = p.icon;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b border-border/50 hover:bg-accent/40 transition-colors cursor-pointer group",
        completing && "opacity-40",
      )}
      onClick={() => onOpen(task)}
    >
      {/* Complete checkbox */}
      <button
        onClick={e => { e.stopPropagation(); setCompleting(true); onComplete(task); }}
        className="w-4 h-4 rounded-full border border-border hover:border-primary flex items-center justify-center flex-shrink-0 transition-colors"
        title="Mark complete"
      >
        {completing && <Check className="w-2.5 h-2.5 text-primary" />}
      </button>

      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", p.cls)} />

      <span className="flex-1 text-sm truncate">{task.title}</span>

      {/* Project badge */}
      <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded truncate max-w-[120px] flex-shrink-0">
        {task.project_name || ""}
      </span>

      {/* Due date */}
      {task.due_date && (
        <span className={cn(
          "flex items-center gap-1 text-[11px] flex-shrink-0",
          sectionFor(task) === "overdue" ? "text-red-500 font-medium" : "text-muted-foreground",
        )}>
          <Calendar className="w-3 h-3" />
          {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
    </div>
  );
}

export default function MyWorkPage() {
  const navigate = useNavigate();
  const { data: tasks = [], isLoading } = useMyWork();
  const [focusMode, setFocusMode]       = useState(false);
  const [groupByProject, setGroupByProject] = useState(false);

  const grouped = SECTIONS.map(s => ({
    ...s,
    tasks: tasks.filter(t => sectionFor(t) === s.id),
  })).filter(s => s.tasks.length > 0);

  const handleOpen = (task) => {
    if (task.project_id && task.workspace_slug) {
      navigate(`/w/${task.workspace_slug}/projects/${task.project_id}?task=${task.id}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Loading your tasks…
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", focusMode && "bg-background")}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <h1 className="text-base font-semibold flex-1">My Work</h1>
        <button
          onClick={() => setGroupByProject(g => !g)}
          className={cn("text-xs px-2.5 py-1 rounded border transition-colors",
            groupByProject ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          Group by project
        </button>
        <button
          onClick={() => setFocusMode(f => !f)}
          title="Focus mode"
          className={cn("p-1.5 rounded border transition-colors",
            focusMode ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <Timer className="w-4 h-4" />
        </button>
      </div>

      {/* Task sections */}
      <div className="flex-1 overflow-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-semibold">You're all caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">No tasks assigned to you right now</p>
          </div>
        ) : (
          grouped.map(section => (
            <div key={section.id}>
              <div className="flex items-center gap-2 px-6 py-2 bg-muted/20 border-b border-border sticky top-0">
                <span className={cn("text-xs font-semibold uppercase tracking-wider", section.labelCls)}>
                  {section.label}
                </span>
                <span className="text-xs text-muted-foreground">· {section.tasks.length}</span>
              </div>
              {section.tasks.map(t => (
                <TaskRow
                  key={t.id}
                  task={t}
                  onComplete={() => {/* optimistic complete handled by navigate + cache */}}
                  onOpen={handleOpen}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
