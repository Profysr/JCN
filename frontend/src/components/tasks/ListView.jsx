import { AlertCircle, ArrowUp, ArrowDown, Minus, Calendar, User } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG = {
  urgent:      { icon: AlertCircle, className: "text-red-500",            dot: "bg-red-500" },
  high:        { icon: ArrowUp,     className: "text-orange-500",         dot: "bg-orange-500" },
  medium:      { icon: Minus,       className: "text-yellow-500",         dot: "bg-yellow-400" },
  low:         { icon: ArrowDown,   className: "text-blue-400",           dot: "bg-blue-400" },
  no_priority: { icon: Minus,       className: "text-muted-foreground/40", dot: "bg-muted-foreground/30" },
};

const COL_HEADER = "px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap";

export default function ListView({ tasks, statuses, onTaskClick, selectedTaskId }) {
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="border-b bg-secondary">
            <th className={cn(COL_HEADER, "w-[40%] pl-4")}>Title</th>
            <th className={COL_HEADER}>Status</th>
            <th className={COL_HEADER}>Priority</th>
            <th className={COL_HEADER}>Assignee</th>
            <th className={COL_HEADER}>Due Date</th>
            <th className={cn(COL_HEADER, "pr-4")}>Labels</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {tasks.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-14 text-center text-sm text-muted-foreground">
                No tasks match your filters.
              </td>
            </tr>
          )}
          {tasks.map((task) => {
            const priorityCfg = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.no_priority;
            const PriorityIcon = priorityCfg.icon;
            const col = statuses.find((s) => s.id === task.status_detail?.id);
            const isSelected = selectedTaskId === task.id;

            return (
              <tr
                key={task.id}
                onClick={() => onTaskClick(task)}
                className={cn(
                  "cursor-pointer transition-colors duration-75",
                  isSelected
                    ? "bg-primary/5 border-l-2 border-l-primary"
                    : "hover:bg-accent/60 bg-card"
                )}
              >
                {/* Title */}
                <td className="pl-4 pr-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priorityCfg.dot)}
                    />
                    <span className="font-medium text-[13px] line-clamp-1">{task.title}</span>
                  </div>
                </td>

                {/* Status */}
                <td className="px-3 py-2.5">
                  {col ? (
                    <span
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium whitespace-nowrap"
                      style={{ backgroundColor: col.color + "20", color: col.color }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: col.color }}
                      />
                      {col.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50 text-xs">—</span>
                  )}
                </td>

                {/* Priority */}
                <td className="px-3 py-2.5">
                  <PriorityIcon className={cn("w-3.5 h-3.5", priorityCfg.className)} />
                </td>

                {/* Assignee */}
                <td className="px-3 py-2.5">
                  {task.assignee ? (
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {(task.assignee.full_name || task.assignee.email)[0].toUpperCase()}
                      </div>
                      <span className="text-[12px] text-muted-foreground truncate max-w-[100px]">
                        {task.assignee.full_name || task.assignee.email}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground/50 text-xs">—</span>
                  )}
                </td>

                {/* Due date */}
                <td className="px-3 py-2.5">
                  {task.due_date ? (
                    <span className="flex items-center gap-1 text-[12px] text-muted-foreground whitespace-nowrap">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50 text-xs">—</span>
                  )}
                </td>

                {/* Labels */}
                <td className="px-3 py-2.5 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {task.labels?.map((l) => (
                      <span
                        key={l.id}
                        className="px-1.5 py-0 rounded text-[10px] font-semibold leading-4"
                        style={{ backgroundColor: l.color + "22", color: l.color }}
                      >
                        {l.name}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
