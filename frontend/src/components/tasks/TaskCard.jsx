import { Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowUp, ArrowDown, Minus, Calendar, MessageSquare, CheckSquare } from "lucide-react";

const PRIORITY_CONFIG = {
  urgent:      { icon: AlertCircle, dot: "bg-red-500",    label: "Urgent" },
  high:        { icon: ArrowUp,     dot: "bg-orange-500", label: "High" },
  medium:      { icon: Minus,       dot: "bg-yellow-400", label: "Medium" },
  low:         { icon: ArrowDown,   dot: "bg-blue-400",   label: "Low" },
  no_priority: { icon: Minus,       dot: "bg-muted-foreground/30", label: "" },
};

export default function TaskCard({ task, index, onClick, isSelected }) {
  const priority = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.no_priority;

  const subtaskPct = task.subtask_count > 0
    ? Math.round((task.done_subtask_count / task.subtask_count) * 100)
    : 0;

  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(task)}
          className={cn(
            "bg-card border border-border rounded-md p-2.5 cursor-pointer select-none",
            "transition-colors duration-100",
            "hover:border-primary/40 hover:bg-white",
            snapshot.isDragging && "shadow-lg border-primary/30 rotate-[0.5deg] opacity-95",
            isSelected && "border-primary bg-primary/5"
          )}
        >
          {/* Priority dot + Labels row */}
          <div className="flex items-center gap-1.5 mb-2">
            <span
              className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", priority.dot)}
              title={priority.label}
            />
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

          {/* Title */}
          <p className="text-[13px] font-medium leading-snug text-foreground mb-2.5">
            {task.title}
          </p>

          {/* Subtask progress */}
          {task.subtask_count > 0 && (
            <div className="mb-2">
              <div className="h-0.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${subtaskPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {task.due_date && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-muted-foreground">
              {task.subtask_count > 0 && (
                <span className="flex items-center gap-0.5 text-[11px]">
                  <CheckSquare className="w-3 h-3" />
                  {task.done_subtask_count}/{task.subtask_count}
                </span>
              )}
              {task.comment_count > 0 && (
                <span className="flex items-center gap-0.5 text-[11px]">
                  <MessageSquare className="w-3 h-3" />
                  {task.comment_count}
                </span>
              )}
              {task.assignee && (
                <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                  {task.assignee.display_name?.[0]?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Draggable>
  );
}
