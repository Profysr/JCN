import { useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Plus, ChevronLeft, CheckCircle, Expand, Minimize2 } from "lucide-react";
import TaskCard from "./TaskCard";
import { cn } from "@/lib/utils";
import { Loader } from "@/components/ui/Loader";

export default function KanbanColumn({
  column,
  tasks,
  onAddTask,
  onTaskClick,
  selectedTaskId,
  selectedIds = new Set(),
  onToggleSelect,
  workspaceId,
  boardId,
  canEdit,
  labelsById = {},
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanding, setExpanding] = useState(false);

  const handleExpand = () => {
    setExpanding(true);
    setTimeout(() => {
      setExpanding(false);
      setCollapsed(false);
    }, 500);
  };

  if (collapsed) {
    return (
      <div
        className="flex flex-col items-center w-10 flex-shrink-0 rounded-md border border-t-[3px] border-border bg-card py-2 gap-3"
        style={{ borderTopColor: column.color }}
      >
        <span
          className="flex-1 text-xs font-semibold text-foreground tracking-wide select-none whitespace-nowrap"
          style={{ writingMode: "vertical-rl" }}
        >
          {column.name}
        </span>

        <span className="text-[11px] text-muted-foreground font-mono tabular-nums">
          {tasks.length}
        </span>

        <button
          onClick={handleExpand}
          disabled={expanding}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors disabled:cursor-default"
          title={`Expand ${column.name}`}
        >
          {expanding
            ? <Loader size="xs" className="" />
            : <Expand size={16} />
          }
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-[272px] flex-shrink-0 animate-column-expand">
      {/* Column header */}
      <div
        className="group flex items-center justify-between px-2 py-2 mb-1.5 rounded-t-md border-t-[3px] bg-card border-x border-border"
        style={{ borderTopColor: column.color }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground tracking-wide">
            {column.name}
          </span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono tabular-nums">
            {tasks.length}
          </span>
          {column.is_done && (
            <CheckCircle className="w-3 h-3 text-emerald-500" title="Done column" />
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCollapsed(true)}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-all opacity-0 group-hover:opacity-100"
            title="Collapse column"
          >
            <Minimize2 size={16} />
          </button>

          {canEdit && (
            <button
              onClick={() => onAddTask(column.id)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
              title={`Add task to ${column.name}`}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Droppable task list */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={cn(
              "flex flex-col gap-1.5 min-h-[200px] rounded-b-md border border-t-0 border-border px-1.5 py-1.5 transition-colors",
              snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : "bg-card/40",
            )}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={onTaskClick}
                isSelected={task.id === selectedTaskId}
                isBulkSelected={selectedIds.has(task.id)}
                onToggleSelect={canEdit ? onToggleSelect : undefined}
                canEdit={canEdit}
                labelsById={labelsById}
              />
            ))}
            {provided.placeholder}
            {tasks.length === 0 && !snapshot.isDraggingOver && (
              <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50 select-none">
                Drop here
              </div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}
