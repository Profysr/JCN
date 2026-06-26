import { useState, useRef, useEffect } from "react";
import { getShortcutDisplay } from "@/shared/lib/shortcutsRegistry";
import { useParams } from "react-router-dom";
import {
  X,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Check,
  Link2,
  GitBranch,
  Search,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTasks } from "@/apps/project-management/hooks/useTasks";

export function TaskTitle({ task, canEdit, update, setConflict, editSignal = 0 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  // Triggered by the `e` keyboard shortcut via jcn:task-action
  useEffect(() => {
    if (editSignal > 0 && canEdit) {
      setDraft(task.title);
      setEditing(true);
    }
  }, [editSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    if (draft.trim() && draft !== task.title)
      update.mutate(
        { title: draft.trim(), version: task.version },
        {
          onError: (err) => {
            if (err?.response?.status === 409) setConflict(err.response.data);
          },
        },
      );
    setEditing(false);
  };

  if (editing && canEdit) {
    return (
      <textarea
        ref={ref}
        rows={2}
        className="w-full text-xl font-bold resize-none bg-transparent border-b-2 border-primary outline-none pb-1 leading-snug"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSave();
          }
        }}
      />
    );
  }

  return (
    <div className="group relative">
      <h2
        onClick={() => canEdit && (setDraft(task.title), setEditing(true))}
        className={cn(
          "text-xl font-bold leading-snug rounded px-1 -mx-1 py-0.5",
          canEdit && "cursor-text hover:bg-accent/40",
        )}
      >
        {task.title}
      </h2>
      {canEdit && (
        <kbd className="absolute -top-1 right-0 font-mono bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {getShortcutDisplay("task:edit-title")}
        </kbd>
      )}
    </div>
  );
}

function CircularProgress({ done, total, allDone }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (total > 0 ? done / total : 0));

  return (
    <div className="relative flex-shrink-0 w-9 h-9">
      <svg viewBox="0 0 24 24" className="w-9 h-9 -rotate-90">
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          className="stroke-border"
        />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={cn(
            "transition-all duration-500",
            allDone ? "stroke-emerald-500" : "stroke-primary",
          )}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            "text-[8px] font-bold tabular-nums leading-none",
            allDone ? "text-emerald-500" : "text-muted-foreground",
          )}
        >
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

function TaskSearchPicker({ tasks, label, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const filtered = tasks
    .filter((t) => t.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="mx-2 mb-2 border rounded-lg bg-background shadow-sm overflow-hidden">
      <div className="px-2.5 py-1.5 border-b flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label}
        </span>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-b">
        <Search className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
        <input
          autoFocus
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
          placeholder="Search tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="max-h-40 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground text-center">
            No tasks available
          </p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
            >
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: t.status_detail?.color || "#94a3b8" }}
              />
              <span className="truncate flex-1">{t.title}</span>
              {t.status_detail && (
                <span
                  className="text-[10px] flex-shrink-0"
                  style={{ color: t.status_detail.color }}
                >
                  {t.status_detail.name}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function ChildTasksSection({
  childTasks,
  task,
  canEdit,
  taskId,
  attachChild,
  createChild,
  navigate,
  projectStatuses,
}) {
  const { workspaceId, boardId } = useParams();
  const [showPicker, setShowPicker] = useState(false);
  // Only fetch all board tasks when the attach picker is opened — avoids a full
  // board-tasks request on every task detail open. Cache hit if board is already loaded.
  const { data: allTasks = [] } = useTasks(workspaceId, boardId, {}, {
    enabled: showPicker,
  });
  const [addingNew, setAddingNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const newInputRef = useRef(null);

  const total = childTasks.length;
  const doneCount = task.done_child_count || 0;
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (addingNew) newInputRef.current?.focus();
  }, [addingNew]);

  useEffect(() => {
    const handler = (ev) => {
      if (!canEdit) return;
      if (ev.detail?.action === "child-new") setAddingNew(true);
      if (ev.detail?.action === "child-attach") setShowPicker(true);
    };
    window.addEventListener("jcn:task-action", handler);
    return () => window.removeEventListener("jcn:task-action", handler);
  }, [canEdit]);

  const handleAdd = (e) => {
    e?.preventDefault();
    if (!newTitle.trim()) {
      setAddingNew(false);
      return;
    }
    createChild.mutate(
      { title: newTitle.trim(), status_id: projectStatuses[0]?.id },
      { onSuccess: () => setNewTitle("") },
    );
  };

  const attachable = allTasks.filter(
    (t) =>
      !t.parent_id && t.id !== taskId && !childTasks.some((c) => c.id === t.id),
  );

  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3.5 py-1.5">
        <div
          className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors duration-300",
            allDone && total > 0 ? "bg-emerald-500/15" : "bg-muted",
          )}
        >
          <GitBranch
            className={cn(
              "w-3 h-3 transition-colors duration-300",
              allDone && total > 0
                ? "text-emerald-500"
                : "text-muted-foreground/40",
            )}
          />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Child Tasks
        </span>
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              onClick={() => {
                setShowPicker((v) => !v);
              }}
              className={cn(
                "flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded transition-colors",
                showPicker
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent",
              )}
            >
              <Link2 className="w-3 h-3" />
              <span>Attach</span>
            </button>
          )}
          {total > 0 && (
            <CircularProgress
              done={doneCount}
              total={total}
              allDone={allDone}
            />
          )}
        </div>
      </div>

      {/* Attach picker */}
      {showPicker && (
        <TaskSearchPicker
          tasks={attachable}
          label="Attach existing task as child"
          onSelect={(id) => {
            attachChild.mutate(id);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}

      {/* Task rows */}
      <div className="px-2 pb-2 space-y-0.5">
        {childTasks.map((child) => (
          <button
            key={child.id}
            onClick={() => navigate(`?task=${child.id}`, { replace: true })}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors group text-left"
          >
            <div
              className="w-2 h-2 rounded-full flex-shrink-0 ring-1 ring-black/10"
              style={{
                backgroundColor: child.status_detail?.color || "#94a3b8",
              }}
            />
            <span
              className={cn(
                "text-sm flex-1 truncate transition-colors",
                child.status_detail?.name?.toLowerCase() === "done" &&
                  "line-through text-muted-foreground/60",
              )}
            >
              {child.title}
            </span>
            {child.status_detail && (
              <span
                className="text-[10px] px-1.5 rounded font-medium leading-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                style={{
                  backgroundColor: child.status_detail.color + "20",
                  color: child.status_detail.color,
                }}
              >
                {child.status_detail.name}
              </span>
            )}
            <ChevronRight className="w-3 h-3 text-transparent group-hover:text-muted-foreground/40 transition-colors flex-shrink-0" />
          </button>
        ))}

        {/* Add row */}
        {canEdit &&
          (addingNew ? (
            <form
              onSubmit={handleAdd}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <div className="w-2 h-2 rounded-full bg-border flex-shrink-0" />
              <input
                ref={newInputRef}
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
                placeholder="New child task…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onBlur={handleAdd}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAddingNew(false);
                    setNewTitle("");
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setAddingNew(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded-md hover:bg-accent/40"
            >
              <Plus className="w-3.5 h-3.5" />
              Add child task
            </button>
          ))}

        {total === 0 && !canEdit && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">
            No child tasks
          </p>
        )}
      </div>
    </div>
  );
}

export function ChecklistSection({
  task,
  subtasks,
  canEdit,
  toggleSubtask,
  deleteSubtask,
  createSubtask,
}) {
  const [newItem, setNewItem] = useState("");
  const [adding, setAdding] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const inputRef = useRef(null);

  const incomplete = subtasks.filter((s) => !s.is_done);
  const completed = subtasks.filter((s) => s.is_done);
  const total = subtasks.length;
  const doneCount = task.done_subtask_count ?? completed.length;
  const allDone = total > 0 && doneCount === total;

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    const handler = (ev) => {
      if (!canEdit) return;
      if (ev.detail?.action === "subtask-new") setAdding(true);
    };
    window.addEventListener("jcn:task-action", handler);
    return () => window.removeEventListener("jcn:task-action", handler);
  }, [canEdit]);

  const handleAdd = (e) => {
    e?.preventDefault();
    if (!newItem.trim()) {
      setAdding(false);
      return;
    }
    createSubtask.mutate(newItem.trim(), { onSuccess: () => setNewItem("") });
  };

  return (
    <div className="rounded border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3.5 py-1.5">
        <div
          className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-colors duration-300",
            allDone ? "bg-emerald-500/15" : "bg-muted",
          )}
        >
          <Check
            className={cn(
              "w-3 h-3 transition-colors duration-300",
              allDone ? "text-emerald-500" : "text-muted-foreground/40",
            )}
          />
        </div>
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          Checklist
        </span>
        {total > 0 && (
          <CircularProgress done={doneCount} total={total} allDone={allDone} />
        )}
      </div>

      {/* Items */}
      <div className="px-2 pb-2 space-y-0.5">
        {/* Incomplete */}
        {incomplete.map((sub) => (
          <ChecklistRow
            key={sub.id}
            sub={sub}
            canEdit={canEdit}
            onToggle={() =>
              toggleSubtask.mutate({ subtaskId: sub.id, is_done: true })
            }
            onDelete={() => deleteSubtask.mutate(sub.id)}
          />
        ))}

        {/* Completed group */}
        {completed.length > 0 && (
          <>
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-1.5 w-full px-2 py-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors rounded-md hover:bg-accent/40"
            >
              {showCompleted ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {completed.length} completed
            </button>
            {showCompleted &&
              completed.map((sub) => (
                <ChecklistRow
                  key={sub.id}
                  sub={sub}
                  canEdit={canEdit}
                  onToggle={() =>
                    toggleSubtask.mutate({ subtaskId: sub.id, is_done: false })
                  }
                  onDelete={() => deleteSubtask.mutate(sub.id)}
                />
              ))}
          </>
        )}

        {/* Add row */}
        {canEdit &&
          (adding ? (
            <form
              onSubmit={handleAdd}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <div className="w-4 h-4 rounded border border-border flex-shrink-0" />
              <input
                ref={inputRef}
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
                placeholder="New item…"
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onBlur={handleAdd}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setAdding(false);
                    setNewItem("");
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
            </form>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors rounded-md hover:bg-accent/40 group"
            >
              <Plus className="w-3.5 h-3.5" />
              Add item
            </button>
          ))}

        {total === 0 && !canEdit && (
          <p className="text-xs text-muted-foreground/50 text-center py-3">
            No checklist items
          </p>
        )}
      </div>
    </div>
  );
}

function ChecklistRow({ sub, canEdit, onToggle, onDelete }) {
  return (
    <div className="flex items-center gap-2 group px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors">
      <button
        onClick={canEdit ? onToggle : undefined}
        disabled={!canEdit}
        className={cn(
          "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all duration-150",
          sub.is_done
            ? "bg-emerald-500/15 border-emerald-500/40"
            : "border-border hover:border-primary",
          canEdit && "cursor-pointer",
        )}
      >
        {sub.is_done && <Check className="w-2.5 h-2.5 text-emerald-500" />}
      </button>
      <span
        className={cn(
          "text-sm flex-1 leading-snug select-none transition-colors",
          sub.is_done
            ? "line-through text-muted-foreground/50"
            : "text-foreground",
        )}
      >
        {sub.title}
      </span>
      {canEdit && (
        <button
          onClick={onDelete}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-destructive transition-opacity flex-shrink-0"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
