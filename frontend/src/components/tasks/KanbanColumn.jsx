import { Droppable } from "@hello-pangea/dnd";
import { Plus } from "lucide-react";
import TaskCard from "./TaskCard";

export default function KanbanColumn({ column, tasks, onAddTask, onTaskClick, selectedTaskId }) {
  return (
    <div className="flex flex-col w-[272px] flex-shrink-0">
      {/* Column header */}
      <div
        className="flex items-center justify-between px-2 py-2 mb-1.5 rounded-t-md border-t-[3px] bg-card border-x border-border"
        style={{ borderTopColor: column.color }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground tracking-wide">{column.name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono tabular-nums">
            {tasks.length}
          </span>
        </div>
        <button
          onClick={() => onAddTask(column.id)}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors"
          title={`Add to ${column.name}`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Droppable task list */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex flex-col gap-1.5 min-h-[200px] rounded-b-md border border-t-0 border-border px-1.5 py-1.5 transition-colors ${
              snapshot.isDraggingOver
                ? "bg-primary/5 border-primary/30"
                : "bg-card/40"
            }`}
          >
            {tasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                index={index}
                onClick={onTaskClick}
                isSelected={task.id === selectedTaskId}
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
