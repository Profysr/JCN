import { useState, useEffect, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Modal from "@/shared/components/ui/Modal";
import { Plus, Trash2, Check, GripVertical, Settings2 } from "lucide-react";
import { useBatchSaveStatuses } from "@/apps/project-management/hooks/useStatusManagement";
import { useToast } from "@/shared/components/ui/toast";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

const PRESET_COLORS = [
  "#94a3b8",
  "#64748b",
  "#475569",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#1d4ed8",
  "#7c3aed",
  "#be185d",
  "#b91c1c",
];

let _tempId = 0;
const tempId = () => `_new_${++_tempId}`;

export default function BoardSettingsModal({
  open,
  onClose,
  workspaceId,
  boardId,
  statuses = [],
}) {
  const batchSave = useBatchSaveStatuses(workspaceId, boardId);
  const { toast } = useToast();

  // Full local copy — all edits live here until Save
  const [local, setLocal] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  // Reset local state every time the modal opens
  useEffect(() => {
    if (open) {
      setLocal(statuses.map((s) => ({ ...s })));
      setAdding(false);
      setNewName("");
      setNewColor("#6366f1");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((id, patch) => {
    setLocal((prev) => {
      let next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));

      // Enforce single-done / single-started, and mutual exclusivity on the same column
      if (patch.is_done) {
        next = next.map((s) =>
          s.id !== id ? { ...s, is_done: false } : { ...s, is_started: false },
        );
      }
      if (patch.is_started) {
        next = next.map((s) =>
          s.id !== id ? { ...s, is_started: false } : { ...s, is_done: false },
        );
      }

      return next;
    });
  }, []);

  const remove = useCallback((id) => {
    setLocal((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleDragEnd = ({ source, destination }) => {
    if (!destination || destination.index === source.index) return;
    setLocal((prev) => {
      const next = [...prev];
      const [moved] = next.splice(source.index, 1);
      next.splice(destination.index, 0, moved);
      return next;
    });
  };

  const handleAddSubmit = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setLocal((prev) => [
      ...prev,
      {
        id: tempId(),
        name: newName.trim(),
        color: newColor,
        is_done: false,
        is_started: false,
        _isNew: true,
      },
    ]);
    setNewName("");
    setNewColor("#6366f1");
    setAdding(false);
  };

  const handleSave = () => {
    // Strip _isNew flag; new items send no 'id' so backend creates them
    const payload = local.map(({ _isNew, id, ...rest }) =>
      _isNew ? rest : { id, ...rest },
    );
    batchSave.mutate(payload, {
      onSuccess: () => {
        toast.success("Columns saved");
        onClose();
      },
      onError: (err) => {
        const msg = err?.response?.data?.error || "Failed to save columns";
        toast.error(msg);
      },
    });
  };

  const isDirty =
    JSON.stringify(local.map(({ _isNew, ...s }) => s)) !==
    JSON.stringify(statuses.map((s) => ({ ...s })));

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Board Columns"
      icon={Settings2}
      showFooter={false}
      padding="p-0"
    >
      <div className="p-5 max-h-[60vh] overflow-y-auto">
        <p className="text-xs text-muted-foreground">
          Drag to reorder. Mark a column as{" "}
          <span className="font-semibold text-emerald-600">Done</span> to count
          its tasks toward the project completion %.
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          Mark a column as{" "}
          <span className="font-semibold text-indigo-600">Started</span> to
          automatically set a task&apos;s start date when it&apos;s moved into
          that column. Only one column can be Started or Done at a time, and a
          column cannot be both.
        </p>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board-statuses">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-1.5"
              >
                {local.map((s, i) => (
                  <Draggable key={s.id} draggableId={String(s.id)} index={i}>
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded-lg border bg-background group",
                          "transition-colors duration-100",
                          snapshot.isDragging
                            ? "shadow-lg border-primary/40 bg-accent"
                            : "hover:border-border/80",
                        )}
                      >
                        <div
                          {...drag.dragHandleProps}
                          className="flex items-center text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-3.5 h-3.5 flex-shrink-0" />
                        </div>

                        <ColorPicker
                          value={s.color}
                          onChange={(color) => update(s.id, { color })}
                        />

                        <StatusName
                          name={s.name}
                          onRename={(name) => update(s.id, { name })}
                        />

                        <button
                          onClick={() =>
                            update(s.id, { is_started: !s.is_started })
                          }
                          title={
                            s.is_started
                              ? "Marked as Started — click to unmark"
                              : "Mark as Started column"
                          }
                          className={cn(
                            "flex items-center justify-center gap-1 text-[11px] font-medium w-[100px] py-0.5 rounded border transition-all shrink-0",
                            s.is_started
                              ? "bg-indigo-500/20 text-indigo-600 border-indigo-400/50"
                              : "text-muted-foreground border-transparent hover:border-border",
                          )}
                        >
                          <Check className="w-3 h-3 shrink-0" />
                          {s.is_started ? "Started" : "Mark started"}
                        </button>

                        <button
                          onClick={() => update(s.id, { is_done: !s.is_done })}
                          title={
                            s.is_done
                              ? "Marked as Done — click to unmark"
                              : "Mark as Done column"
                          }
                          className={cn(
                            "flex items-center justify-center gap-1 text-[11px] font-medium w-[80px] py-0.5 rounded border transition-all shrink-0",
                            s.is_done
                              ? "bg-emerald-500/20 text-emerald-600 border-emerald-400/50"
                              : "text-muted-foreground border-transparent hover:border-border",
                          )}
                        >
                          <Check className="w-3 h-3 shrink-0" />
                          {s.is_done ? "Done" : "Mark done"}
                        </button>

                        <DeleteButton onDelete={() => remove(s.id)} />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {adding ? (
          <form
            onSubmit={handleAddSubmit}
            className="flex items-center gap-2 pt-2 border-t mt-3"
          >
            <ColorPicker value={newColor} onChange={setNewColor} dropUp />
            <input
              autoFocus
              className="flex-1 text-sm border rounded-md px-2.5 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
              placeholder="Column name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
            <Button type="submit" size="sm">
              Add
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mt-3 pt-2 border-t w-full transition-colors"
          >
            <Plus className="w-4 h-4" /> Add column
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-5 py-2.5 border-t">
        <Button
          variant="outline"
          onClick={onClose}
          disabled={batchSave.isPending}
        >
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!isDirty || batchSave.isPending}>
          {batchSave.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

function StatusName({ name, onRename }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  // Keep value in sync when the parent name changes (e.g. modal reset)
  useEffect(() => setValue(name), [name]);

  const save = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setValue(name);
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="flex-1 text-sm bg-transparent outline-none border-b border-primary"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
      />
    );
  }

  return (
    <span
      className="flex-1 text-sm cursor-text hover:text-primary transition-colors"
      onClick={() => setEditing(true)}
      title="Click to rename"
    >
      {name}
    </span>
  );
}

function DeleteButton({ onDelete }) {
  return (
    <button
      onClick={onDelete}
      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded hover:bg-destructive/10 transition-all flex-shrink-0"
      title="Remove column"
    >
      <Trash2 className="w-3.5 h-3.5" />
    </button>
  );
}

function ColorPicker({ value, onChange, dropUp = false }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
        style={{ backgroundColor: value }}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          className={cn(
            "absolute left-0 z-50 bg-popover border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 w-[136px]",
            dropUp ? "bottom-7" : "top-7",
          )}
        >
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn(
                "w-5 h-5 rounded-full border-2 transition-transform hover:scale-110",
                c === value
                  ? "border-foreground scale-110"
                  : "border-transparent",
              )}
              style={{ backgroundColor: c }}
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
