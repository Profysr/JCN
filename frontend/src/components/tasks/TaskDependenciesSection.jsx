import { useState } from "react";
import { useDependencies, useAddDependency, useRemoveDependency } from "@/hooks/useDependencies";
import { useTasks } from "@/hooks/useTasks";
import { Link2, X, AlertCircle, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

const PRIORITY_DOT = {
  urgent: "bg-red-500", high: "bg-orange-500",
  medium: "bg-yellow-400", low: "bg-blue-400", no_priority: "bg-muted-foreground/30",
};

function TaskChip({ taskData, onRemove }) {
  return (
    <div className="flex items-center gap-2 group px-2.5 py-1.5 rounded-md border bg-card hover:bg-accent/50 transition-colors text-xs">
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[taskData.priority] || "bg-muted-foreground/30")} />
      <span className="font-medium truncate flex-1 max-w-[180px]">{taskData.title}</span>
      {taskData.status_detail && (
        <span
          className="px-1.5 py-0 rounded text-[10px] font-medium leading-4 flex-shrink-0"
          style={{ backgroundColor: taskData.status_detail.color + "20", color: taskData.status_detail.color }}
        >
          {taskData.status_detail.name}
        </span>
      )}
      <button
        onClick={onRemove}
        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddDependencyPicker({ tasks, onAdd, onClose, label }) {
  const [query, setQuery] = useState("");
  const filtered = tasks.filter((t) =>
    t.title.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 8);

  return (
    <div className="mt-2 border rounded-lg bg-card shadow-sm overflow-hidden">
      <div className="px-2.5 py-2 border-b flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <input
        autoFocus
        className="w-full px-2.5 py-2 text-xs border-b bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder="Search tasks…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="max-h-40 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground text-center">No tasks found</p>
        ) : (
          filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => { onAdd(t.id); onClose(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors text-left"
            >
              <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIORITY_DOT[t.priority])} />
              <span className="truncate">{t.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function TaskDependenciesSection({ workspaceSlug, projectId, taskId }) {
  const { data: deps = { blocked_by: [], blocking: [] } } = useDependencies(workspaceSlug, projectId, taskId);
  const { data: allTasks = [] } = useTasks(workspaceSlug, projectId);
  const addDep    = useAddDependency(workspaceSlug, projectId, taskId);
  const removeDep = useRemoveDependency(workspaceSlug, projectId, taskId);
  const [picker, setPicker] = useState(null); // "blocked_by" | "blocks" | null

  const otherTasks = allTasks.filter((t) => t.id !== taskId);

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">Dependencies</p>
      </div>

      {/* Blocked by */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-orange-500" /> Blocked by
          </span>
          <button
            onClick={() => setPicker(picker === "blocked_by" ? null : "blocked_by")}
            className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-1">
          {deps.blocked_by.map((d) => (
            <TaskChip
              key={d.id}
              taskData={d.task}
              onRemove={() => removeDep.mutate(d.id)}
            />
          ))}
          {deps.blocked_by.length === 0 && picker !== "blocked_by" && (
            <p className="text-[11px] text-muted-foreground/60 italic px-1">None</p>
          )}
        </div>
        {picker === "blocked_by" && (
          <AddDependencyPicker
            tasks={otherTasks}
            label="This task is blocked by…"
            onAdd={(id) => addDep.mutate({ task_id: id, type: "blocked_by" })}
            onClose={() => setPicker(null)}
          />
        )}
      </div>

      {/* Blocking */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <ChevronRight className="w-3 h-3 text-blue-500" /> Blocking
          </span>
          <button
            onClick={() => setPicker(picker === "blocks" ? null : "blocks")}
            className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
        <div className="space-y-1">
          {deps.blocking.map((d) => (
            <TaskChip
              key={d.id}
              taskData={d.task}
              onRemove={() => removeDep.mutate(d.id)}
            />
          ))}
          {deps.blocking.length === 0 && picker !== "blocks" && (
            <p className="text-[11px] text-muted-foreground/60 italic px-1">None</p>
          )}
        </div>
        {picker === "blocks" && (
          <AddDependencyPicker
            tasks={otherTasks}
            label="This task blocks…"
            onAdd={(id) => addDep.mutate({ task_id: id, type: "blocks" })}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
    </div>
  );
}
