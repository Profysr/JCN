import { Draggable } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import { Calendar, MessageSquare, CheckSquare, ShieldCheck } from "lucide-react";
import { getPriority, getTaskType } from "@/lib/constants";
import { Avatar } from "@/components/ui/avatar";

export default function TaskCard({
  task,
  index,
  onClick,
  isSelected,
  isBulkSelected,
  onToggleSelect,
  canEdit = true,
  viewers = [],
}) {
  const _p = getPriority(task.priority);
  const priority = { ..._p, dot: _p.dotCls, cls: _p.textCls }; // shape compat
  const typeConfig = getTaskType(task.task_type);
  const TypeIcon = typeConfig.icon;

  const subtaskPct =
    task.subtask_count > 0
      ? Math.round((task.done_subtask_count / task.subtask_count) * 100)
      : 0;

  return (
    <Draggable draggableId={task.id} index={index} isDragDisabled={!canEdit}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick?.(task)}
          className={cn(
            "bg-card border border-border rounded-md p-2.5 cursor-pointer select-none relative group",
            "transition-colors duration-100",
            "hover:border-primary/40 hover:bg-accent/40",
            snapshot.isDragging &&
              "shadow-lg border-primary/30 rotate-[0.5deg] opacity-95",
            isSelected && "border-primary bg-primary/5",
            isBulkSelected &&
              "border-primary bg-primary/10 ring-1 ring-primary/30",
          )}
        >
          {/* Bulk-select checkbox (hover or selected) */}
          {onToggleSelect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(task.id);
              }}
              className={cn(
                "absolute top-2 left-2 w-4 h-4 rounded border-2 flex items-center justify-center transition-all z-10",
                isBulkSelected
                  ? "bg-primary border-primary opacity-100 scale-100"
                  : "bg-card/80 border-border/60 opacity-50 group-hover:opacity-100 group-hover:border-primary/60",
              )}
            >
              {isBulkSelected && (
                <svg
                  className="w-2.5 h-2.5 text-white"
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

          {/* Type badge (only for non-default types) + Priority dot + Labels */}
          <div
            className={cn(
              "flex items-center gap-1.5 mb-2 flex-wrap",
              onToggleSelect && "pl-5",
            )}
          >
            {task.task_type && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold leading-none flex-shrink-0",
                  typeConfig.bg,
                  typeConfig.color,
                )}
              >
                <TypeIcon className="w-2.5 h-2.5" />
                {typeConfig.label}
              </span>
            )}

            {task.labels?.map((l) => (
              <span
                key={l.id}
                className="px-1.5 py-0 rounded text-[10px] font-semibold leading-4"
                style={{ backgroundColor: l.color + "22", color: l.color }}
              >
                {l.name}
              </span>
            ))}

            {/* Priority dot — only shown when priority is set */}
            {task.priority && (
              <span className={cn("self-end ml-auto")}>
                {priority.icon && (
                  <priority.icon className={cn("w-3.5 h-3.5", priority.cls)} />
                )}
              </span>
            )}
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
                  {new Date(task.due_date + "T00:00:00").toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )}
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

              {/* Approval badge — v3.6.0 */}
              {(task.pending_approval_count > 0 || task.approved_approval_count > 0) && (
                <span
                  className={cn(
                    "flex items-center gap-0.5 text-[11px]",
                    task.pending_approval_count > 0
                      ? "text-amber-600"
                      : "text-emerald-600",
                  )}
                  title={task.pending_approval_count > 0 ? "Pending approval" : "Approved"}
                >
                  <ShieldCheck className="w-3 h-3" />
                  {task.approved_approval_count}/{task.pending_approval_count + task.approved_approval_count}
                </span>
              )}

              {/* Viewer avatar stack */}
              {viewers.length > 0 && (
                <div className="flex items-center -space-x-1 ml-auto">
                  {viewers.slice(0, 3).map((v) => (
                    <div key={v.user.id} title={`${v.user.full_name || v.user.email} is viewing`}>
                      <Avatar
                        name={v.user.display_name || v.user.full_name || v.user.email}
                        src={v.user.avatar}
                        size="xs"
                        className="ring-1 ring-background"
                      />
                    </div>
                  ))}
                  {viewers.length > 3 && (
                    <span className="text-[9px] text-muted-foreground pl-1.5">
                      +{viewers.length - 3}
                    </span>
                  )}
                </div>
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
          </div>
        </div>
      )}
    </Draggable>
  );
}
