import { Draggable } from "@hello-pangea/dnd";
import { cn } from "@/shared/lib/utils";
import { Calendar, ShieldCheck, GitBranch } from "lucide-react";
import { getPriority, getTaskType } from "@/shared/lib/constants";
import { Avatar } from "@/shared/components/ui/avatar";

export default function TaskCard({
  task,
  index,
  onClick,
  isSelected,
  isBulkSelected,
  onToggleSelect,
  canEdit = true,
  labelsById = {},
}) {
  const priority = getPriority(task.priority);
  const PriorityIcon = priority.icon;
  const typeConfig = getTaskType(task.task_type);
  const TypeIcon = typeConfig.icon;

  const labels = (task.label_ids ?? [])
    .map((id) => labelsById[id])
    .filter(Boolean);

  const subtaskPct =
    task.subtask_count > 0
      ? Math.round((task.done_subtask_count / task.subtask_count) * 100)
      : 0;

  const dueDateStr = task.due_date
    ? new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : null;

  const isOverdue =
    task.due_date && new Date(task.due_date + "T23:59:59") < new Date();

  const hasMeta =
    task.subtask_count > 0 ||
    task.child_count > 0 ||
    task.pending_approval_count > 0 ||
    task.approved_approval_count > 0;

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canEdit}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(task)}
          className={cn(
            "bg-card border border-border rounded-md cursor-pointer select-none relative group overflow-hidden",
            "transition-all duration-100",
            "hover:border-primary/30 hover:shadow-md hover:shadow-black/10",
            snapshot.isDragging &&
              "shadow-xl border-primary/40 rotate-[0.8deg] opacity-95 scale-[1.02]",
            isSelected && "border-primary/60 bg-primary/5 shadow-sm",
            isBulkSelected &&
              "border-primary bg-primary/10 ring-1 ring-primary/30",
          )}
        >
          {/* Left priority accent bar */}
          <div
            className="absolute left-0 top-0 bottom-0 w-[3px]"
            style={{
              backgroundColor: priority.hex,
              opacity: 0.7,
            }}
          />

          <div className="pl-3.5 pr-2.5 pt-2 pb-2.5">
            {/* Row 1: task type (left) | date + assignee (right) */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-semibold leading-none flex-1 min-w-0",
                  typeConfig.color,
                )}
              >
                <TypeIcon className="w-2.5 h-2.5 flex-shrink-0" />
                <span className="truncate">{typeConfig.label}</span>
              </span>

              {dueDateStr && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] flex-shrink-0 font-medium",
                    isOverdue ? "text-red-500" : "text-muted-foreground/60",
                  )}
                >
                  <Calendar className="w-2.5 h-2.5" />
                  {dueDateStr}
                </span>
              )}

              {task.assignee && (
                <Avatar
                  name={
                    task.assignee.display_name ||
                    task.assignee.full_name ||
                    task.assignee.email
                  }
                  src={task.assignee.avatar}
                  size="xs"
                />
              )}
            </div>

            {/* Row 2: title (with optional bulk-select checkbox) */}
            <div className="flex items-start gap-2 mb-2">
              {onToggleSelect && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect(task.id);
                  }}
                  className={cn(
                    "mt-0.5 w-3.5 h-3.5 rounded border-[1.5px] flex-shrink-0 flex items-center justify-center transition-all",
                    isBulkSelected
                      ? "bg-primary border-primary"
                      : "border-primary/50",
                  )}
                >
                  {isBulkSelected && (
                    <svg
                      className="w-2 h-2 text-white"
                      viewBox="0 0 10 8"
                      fill="none"
                    >
                      <path
                        d="M1 4l3 3 5-6"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              )}
              <p className="text-[13px] font-semibold leading-snug text-foreground flex-1">
                {task.title}
              </p>
            </div>

            {/* Row 3: subtask progress bar + percentage */}
            {task.subtask_count > 0 && (
              <div className="flex items-center gap-0.5 mb-1.5">
                <div className="h-1 bg-border rounded-full overflow-hidden w-8">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      subtaskPct === 100 ? "bg-emerald-500" : "bg-primary",
                    )}
                    style={{ width: `${subtaskPct}%` }}
                  />
                </div>
                <span
                  className={cn(
                    "text-[10px] font-semibold tabular-nums flex-shrink-0",
                    subtaskPct === 100
                      ? "text-emerald-500"
                      : "text-muted-foreground",
                  )}
                >
                  {subtaskPct}%
                </span>
              </div>
            )}

            {/* Row 4: labels | right-side meta + priority icon */}
            {(labels.length > 0 || task.priority || hasMeta) && (
              <div className="flex items-center gap-1">
                {labels.slice(0, 2).map((l) => (
                  <span
                    key={l.id}
                    className="px-1.5 py-0 rounded-sm text-[10px] font-semibold leading-[1.4rem]"
                    style={{ backgroundColor: l.color + "25", color: l.color }}
                  >
                    {l.name}
                  </span>
                ))}
                {labels.length > 2 && (
                  <span className="px-1.5 py-0 rounded-sm text-[10px] font-semibold leading-[1.4rem] bg-muted text-muted-foreground">
                    +{labels.length - 2}
                  </span>
                )}

                <div className="flex-1" />

                {task.child_count > 0 && !task.subtask_count && (
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/60">
                    <GitBranch className="w-3 h-3" />
                    {task.child_count}
                  </span>
                )}

                {(task.pending_approval_count > 0 ||
                  task.approved_approval_count > 0) && (
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[10px] font-medium flex-shrink-0",
                      task.pending_approval_count > 0
                        ? "text-amber-500"
                        : "text-emerald-500",
                    )}
                    title={
                      task.pending_approval_count > 0
                        ? "Pending approval"
                        : "Approved"
                    }
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {task.approved_approval_count}/
                    {task.pending_approval_count + task.approved_approval_count}
                  </span>
                )}

                {task.priority && (
                  <span
                    className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-sm text-[10px] font-semibold leading-[1.4rem] flex-shrink-0"
                    style={{
                      backgroundColor: priority.hex + "22",
                      color: priority.hex,
                    }}
                  >
                    <PriorityIcon className="w-2.5 h-2.5" />
                    {priority.label}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
