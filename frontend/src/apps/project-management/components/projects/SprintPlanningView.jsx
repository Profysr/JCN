import { useState, useMemo } from "react";
import {
  Search,
  ArrowRight,
  X,
  Users,
  Zap,
  CheckCircle2,
  Play,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { useUpdateTask } from "@/apps/project-management/hooks/useTasks";
import { useUpdateSprint, useBulkSprintTasks } from "@/apps/project-management/hooks/useSprints";
import { getPriority } from "@/shared/lib/constants";

function TaskRow({ task, action, onAction, onTaskClick, selected, onToggle }) {
  const priority = getPriority(task.priority);
  return (
    <div
      onClick={() => onTaskClick?.(task.id)}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg group cursor-pointer transition-colors",
        selected ? "bg-primary/8 hover:bg-primary/12" : "hover:bg-accent/60",
      )}
    >
      {/* Checkbox — only shown for backlog (add) rows */}
      {onToggle && (
        <input
          type="checkbox"
          checked={!!selected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 flex-shrink-0 accent-primary cursor-pointer"
        />
      )}

      <div
        className={cn("w-2 h-2 rounded-full flex-shrink-0", priority.dotCls)}
        title={priority.label}
      />
      <span className="flex-1 text-sm truncate min-w-0">{task.title}</span>

      {/* Assignee avatar */}
      {task.assignee && (
        <Avatar
          user={task.assignee}
          name={task.assignee.full_name || task.assignee.email}
          src={task.assignee.avatar}
          size="xs"
          ring
        />
      )}

      {/* Action button (visible on hover) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAction(task);
        }}
        className={cn(
          "flex-shrink-0 p-1 rounded transition-all opacity-0 group-hover:opacity-100",
          action === "add"
            ? "text-muted-foreground hover:text-primary hover:bg-primary/10"
            : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
        )}
        title={action === "add" ? "Add to sprint" : "Remove from sprint"}
      >
        {action === "add" ? (
          <ArrowRight className="w-3.5 h-3.5" />
        ) : (
          <X className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

// _Capactiy Meter for each person __________________________________
// 1. Single source of truth for capacity configuration
const CAPACITY_CONFIG = {
  good: {
    label: "Looks good",
    textClass: "text-emerald-600",
    bgClass: "bg-emerald-500",
  },
  ok: {
    label: "Getting full",
    textClass: "text-amber-500",
    bgClass: "bg-amber-400",
  },
  over: {
    label: "Over-committed",
    textClass: "text-red-500",
    bgClass: "bg-red-500",
  },
};

// 2. Extracted pure logic function to determine the status key
const getCapacityStatus = (perPerson) => {
  if (perPerson <= 5) return "good";
  if (perPerson <= 9) return "ok";
  return "over";
};

function CapacityMeter({ stagedCount, memberCount }) {
  // Prevent division by zero, default to stagedCount if no members
  const perPerson = memberCount > 0 ? stagedCount / memberCount : stagedCount;

  // Get current status key and its configuration
  const statusKey = getCapacityStatus(perPerson);
  const config = CAPACITY_CONFIG[statusKey];

  // Calculate percentage (capped at 100)
  const pct = Math.min(100, (perPerson / 10) * 100);

  return (
    <div className="bg-muted/50 rounded-xl p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        {/* Team Member Count */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="w-3.5 h-3.5" />
          <span>
            {memberCount} team member{memberCount !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Status Label */}
        <span className={cn("text-xs font-semibold", config.textClass)}>
          {config.label}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            config.bgClass,
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Helper Text */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {perPerson > 0
          ? `~${perPerson.toFixed(1)} tasks per person`
          : "No tasks staged yet"}
        {statusKey === "over" &&
          " — consider removing some tasks before starting"}
      </p>
    </div>
  );
}

export default function SprintPlanningView({
  backlogTasks,
  stagedTasks,
  sprint,
  members,
  onTaskClick,
  labelsById: _labelsById,
  workspaceId,
  boardId,
}) {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedStagedIds, setSelectedStagedIds] = useState(new Set());
  const updateTask = useUpdateTask(workspaceId, boardId);
  const updateSprint = useUpdateSprint(workspaceId, boardId);
  const bulkSprintTasks = useBulkSprintTasks(workspaceId, boardId);

  const filteredBacklog = useMemo(
    () =>
      backlogTasks.filter(
        (t) => !search || t.title.toLowerCase().includes(search.toLowerCase()),
      ),
    [backlogTasks, search],
  );

  const toggleSelect = (taskId) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });

  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      prev.size === filteredBacklog.length
        ? new Set()
        : new Set(filteredBacklog.map((t) => t.id)),
    );

  const addToSprint = (task) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(task.id); return n; });
    updateTask.mutate({ taskId: task.id, sprint_id: sprint.id });
  };

  const addSelectedToSprint = () => {
    if (!selectedIds.size) return;
    bulkSprintTasks.mutate(
      { sprintId: sprint.id, taskIds: Array.from(selectedIds), action: "add" },
      { onSuccess: () => setSelectedIds(new Set()) },
    );
  };

  const toggleSelectStaged = (taskId) =>
    setSelectedStagedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });

  const toggleSelectAllStaged = () =>
    setSelectedStagedIds((prev) =>
      prev.size === stagedTasks.length
        ? new Set()
        : new Set(stagedTasks.map((t) => t.id)),
    );

  const removeFromSprint = (task) => {
    setSelectedStagedIds((prev) => { const n = new Set(prev); n.delete(task.id); return n; });
    updateTask.mutate({ taskId: task.id, sprint_id: null });
  };

  const removeSelectedFromSprint = () => {
    if (!selectedStagedIds.size) return;
    bulkSprintTasks.mutate(
      { sprintId: sprint.id, taskIds: Array.from(selectedStagedIds), action: "remove" },
      { onSuccess: () => setSelectedStagedIds(new Set()) },
    );
  };

  const startSprint = () =>
    updateSprint.mutate({ sprintId: sprint.id, status: "active" });

  const memberCount = members.length || 1;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── LEFT: Backlog ── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r">
        <div className="px-5 py-4 border-b flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Backlog</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {filteredBacklog.length} unassigned task
                {filteredBacklog.length !== 1 ? "s" : ""}
              </p>
            </div>
            {selectedIds.size > 0 && (
              <Button
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={addSelectedToSprint}
                disabled={bulkSprintTasks.isPending}
              >
                <ChevronsRight className="w-3.5 h-3.5" />
                Add {selectedIds.size} to sprint
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              className="w-full text-sm border rounded-lg pl-9 pr-3 py-2 bg-background outline-none focus:ring-2 focus:ring-ring"
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {filteredBacklog.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-primary"
                checked={selectedIds.size === filteredBacklog.length && filteredBacklog.length > 0}
                onChange={toggleSelectAll}
              />
              Select all
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {filteredBacklog.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
              <CheckCircle2 className="w-9 h-9 text-emerald-500/40" />
              <p className="text-sm text-muted-foreground">
                {search ? "No matching tasks" : "All tasks are in a sprint"}
              </p>
            </div>
          ) : (
            filteredBacklog.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                action="add"
                onAction={addToSprint}
                onTaskClick={onTaskClick}
                selected={selectedIds.has(task.id)}
                onToggle={toggleSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* ── RIGHT: Sprint commitment ── */}
      <div className="w-[400px] flex-shrink-0 flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b flex-shrink-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-primary" />
                {sprint.name}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {stagedTasks.length} task{stagedTasks.length !== 1 ? "s" : ""}{" "}
                staged for this sprint
              </p>
            </div>
            {selectedStagedIds.size > 0 && (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 shrink-0"
                onClick={removeSelectedFromSprint}
                disabled={bulkSprintTasks.isPending}
              >
                <ChevronsLeft className="w-3.5 h-3.5" />
                Remove {selectedStagedIds.size}
              </Button>
            )}
          </div>

          <CapacityMeter
            stagedCount={stagedTasks.length}
            memberCount={memberCount}
          />

          {stagedTasks.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-primary"
                checked={selectedStagedIds.size === stagedTasks.length && stagedTasks.length > 0}
                onChange={toggleSelectAllStaged}
              />
              Select all
            </label>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {stagedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center gap-2 px-4">
              <ArrowRight className="w-9 h-9 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                Click the arrow on any backlog task to commit it to this sprint
              </p>
            </div>
          ) : (
            stagedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                action="remove"
                onAction={removeFromSprint}
                onTaskClick={onTaskClick}
                selected={selectedStagedIds.has(task.id)}
                onToggle={toggleSelectStaged}
              />
            ))
          )}
        </div>

        {/* Start CTA */}
        <div className="border-t px-5 py-4 flex-shrink-0 space-y-2">
          {stagedTasks.length === 0 ? (
            <Button disabled className="w-full gap-2">
              <Play className="w-3.5 h-3.5" /> Stage tasks to start
            </Button>
          ) : (
            <Button className="w-full gap-2" onClick={startSprint}>
              <Play className="w-3.5 h-3.5" />
              Start Sprint · {stagedTasks.length} tasks
            </Button>
          )}
          {sprint.goal && (
            <p className="text-xs text-muted-foreground text-center">
              Goal: {sprint.goal}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
