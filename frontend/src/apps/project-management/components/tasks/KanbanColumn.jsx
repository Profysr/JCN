import { useState } from "react";
import { Droppable } from "@hello-pangea/dnd";
import {
  Plus,
  ChevronLeft,
  CheckCircle,
  PlayCircle,
  Expand,
  Minimize2,
  ArrowRight,
} from "lucide-react";
import TaskCard from "./TaskCard";
import { cn } from "@/shared/lib/utils";
import { Loader } from "@/shared/components/ui/Loader";

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
  dragSourceName = null,
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
          {expanding ? <Loader size="xs" className="" /> : <Expand size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-72 flex-shrink-0 animate-column-expand">
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => {
          const isReceiving = snapshot.isDraggingOver && !!dragSourceName;
          const leavingColumn =
            !!snapshot.draggingFromThisWith && !snapshot.isDraggingOver;

          return (
            <div
              className="flex flex-col rounded-md transition-shadow duration-200"
              style={
                isReceiving
                  ? {
                      boxShadow: `0 0 0 2px ${column.color}, 0 0 18px ${column.color}50`,
                    }
                  : undefined
              }
            >
              {/* Column header */}
              <div
                className={cn(
                  "group flex items-center justify-between px-2 py-2 mb-1.5 rounded-t-md border-t-[3px] bg-card border-x border-border transition-colors duration-200",
                  isReceiving && "bg-card/80",
                )}
                style={{ borderTopColor: column.color }}
              >
                {isReceiving ? (
                  /* Transition label: "Source → Destination" */
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate max-w-[90px]">
                      {dragSourceName}
                    </span>
                    <ArrowRight
                      className="w-3 h-3 flex-shrink-0 animate-drag-arrow"
                      style={{ color: column.color }}
                    />
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider truncate"
                      style={{ color: column.color }}
                    >
                      {column.name}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground tracking-wide">
                      {column.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono tabular-nums">
                      {tasks.length}
                    </span>
                    {column.is_started && (
                      <PlayCircle
                        className="w-3 h-3 text-blue-500"
                        title="Started column"
                      />
                    )}
                    {column.is_done && (
                      <CheckCircle
                        className="w-3 h-3 text-emerald-500"
                        title="Done column"
                      />
                    )}
                  </div>
                )}

                {!isReceiving && (
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
                )}
              </div>

              {/* Droppable task list */}
              <div
                className={cn(
                  "max-h-[480px] overflow-y-auto rounded-b-md border border-t-0 border-border transition-colors duration-200",
                  isReceiving
                    ? "border-transparent"
                    : snapshot.isDraggingOver
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card/40",
                )}
              >
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="flex flex-col gap-1.5 min-h-[200px] px-1.5 py-1.5"
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

                {/* Placeholder collapses with a smooth transition when task leaves */}
                <div
                  className="overflow-hidden transition-all duration-250 ease-out"
                  style={{ maxHeight: leavingColumn ? 0 : undefined }}
                >
                  {provided.placeholder}
                </div>

                {tasks.length === 0 && !snapshot.isDraggingOver && (
                  <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/50 select-none">
                    Drop here
                  </div>
                )}
                </div>
              </div>
            </div>
          );
        }}
      </Droppable>
    </div>
  );
}
