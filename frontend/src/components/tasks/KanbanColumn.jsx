import { useState, useRef } from "react";
import { Droppable } from "@hello-pangea/dnd";
import { Plus, MoreHorizontal, Pencil, Check, Trash2, X, CheckCircle } from "lucide-react";
import TaskCard from "./TaskCard";
import { useUpdateStatus, useDeleteStatus } from "@/hooks/useStatusManagement";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";

const PRESET_COLORS = [
  "#94a3b8","#6366f1","#8b5cf6","#ec4899",
  "#f59e0b","#22c55e","#14b8a6","#3b82f6",
  "#ef4444","#f97316","#64748b","#0ea5e9",
];

function ColumnMenu({ column, workspaceSlug, projectId, onClose }) {
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal]   = useState(column.name);
  const [showColors, setShowColors] = useState(false);

  const updateStatus = useUpdateStatus(workspaceSlug, projectId);
  const deleteStatus = useDeleteStatus(workspaceSlug, projectId);

  const commitRename = () => {
    if (nameVal.trim() && nameVal !== column.name) {
      updateStatus.mutate({ statusId: column.id, name: nameVal.trim() });
    }
    setRenaming(false);
    onClose();
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${column.name}"? Tasks in this column will lose their status.`)) {
      deleteStatus.mutate(column.id);
      onClose();
    }
  };

  if (renaming) {
    return (
      <div
        className="absolute top-full right-0 mt-1 z-50 bg-popover border rounded-xl shadow-popover p-2 w-44"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          className="w-full text-sm border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setRenaming(false); onClose(); }
          }}
        />
        <div className="flex gap-1 mt-1.5">
          <button onClick={commitRename} className="flex-1 text-xs py-1 bg-primary text-primary-foreground rounded-md font-medium">
            Save
          </button>
          <button onClick={() => { setRenaming(false); onClose(); }} className="flex-1 text-xs py-1 border rounded-md text-muted-foreground hover:bg-accent">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute top-full right-0 mt-1 z-50 bg-popover border rounded-xl shadow-popover py-1 w-44"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Rename */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-sm transition-colors text-left"
        onClick={() => setRenaming(true)}
      >
        <Pencil className="w-3.5 h-3.5 text-muted-foreground" /> Rename
      </button>

      {/* Mark as done toggle */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-sm transition-colors text-left"
        onClick={() => { updateStatus.mutate({ statusId: column.id, is_done: !column.is_done }); onClose(); }}
      >
        <CheckCircle className={cn("w-3.5 h-3.5", column.is_done ? "text-emerald-500" : "text-muted-foreground")} />
        {column.is_done ? "Unmark as Done" : "Mark as Done"}
      </button>

      {/* Color picker */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-sm transition-colors text-left"
        onClick={() => setShowColors((v) => !v)}
      >
        <span className="w-3.5 h-3.5 rounded-full border border-border/60 flex-shrink-0" style={{ backgroundColor: column.color }} />
        Change color
      </button>

      {showColors && (
        <div className="px-3 py-2 grid grid-cols-6 gap-1.5 border-t">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              className={cn("w-5 h-5 rounded-full border-2 transition-transform hover:scale-110", c === column.color ? "border-foreground scale-110" : "border-transparent")}
              style={{ backgroundColor: c }}
              onClick={() => { updateStatus.mutate({ statusId: column.id, color: c }); onClose(); }}
            />
          ))}
        </div>
      )}

      {/* Delete */}
      <div className="border-t mt-1 pt-1">
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-destructive/10 text-sm text-destructive transition-colors text-left"
          onClick={handleDelete}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete column
        </button>
      </div>
    </div>
  );
}

export default function KanbanColumn({
  column, tasks, onAddTask, onTaskClick,
  selectedTaskId, selectedIds = new Set(), onToggleSelect,
  workspaceSlug, projectId, canEdit,
  columnViewers = [],
  taskViewerMap  = {},
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  return (
    <div className="flex flex-col w-[272px] flex-shrink-0">
      {/* Active-user avatar strip above header */}
      {columnViewers.length > 0 && (
        <div className="flex items-center gap-1 px-2 pb-1">
          {columnViewers.slice(0, 5).map((v) => (
            <div key={v.user.id} title={v.user.full_name || v.user.email}>
              <Avatar
                name={v.user.display_name || v.user.full_name || v.user.email}
                src={v.user.avatar}
                size="xs"
                className="ring-1 ring-background"
              />
            </div>
          ))}
          {columnViewers.length > 5 && (
            <span className="text-[9px] text-muted-foreground">+{columnViewers.length - 5}</span>
          )}
        </div>
      )}

      {/* Column header */}
      <div
        className="group flex items-center justify-between px-2 py-2 mb-1.5 rounded-t-md border-t-[3px] bg-card border-x border-border"
        style={{ borderTopColor: column.color }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground tracking-wide">{column.name}</span>
          <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono tabular-nums">
            {tasks.length}
          </span>
          {column.is_done && (
            <CheckCircle className="w-3 h-3 text-emerald-500" title="Done column" />
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Column settings menu */}
          {canEdit && (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-all opacity-0 group-hover:opacity-100"
                title="Column options"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <ColumnMenu
                    column={column}
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    onClose={() => setMenuOpen(false)}
                  />
                </>
              )}
            </div>
          )}

          {/* Add task to this column */}
          {canEdit && (
            <button
              onClick={() => onAddTask(column.id)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent transition-colors"
              title={`Add task to ${column.name}`}
            >
              <Plus className="w-3.5 h-3.5" />
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
            className={`flex flex-col gap-1.5 min-h-[200px] rounded-b-md border border-t-0 border-border px-1.5 py-1.5 transition-colors ${
              snapshot.isDraggingOver ? "bg-primary/5 border-primary/30" : "bg-card/40"
            }`}
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
                viewers={taskViewerMap[task.id] || []}
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
