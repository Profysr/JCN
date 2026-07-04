import { useState, useMemo } from "react";
import { Zap } from "lucide-react";
import { DragDropContext } from "@hello-pangea/dnd";
import KanbanColumn from "@/apps/project-management/components/tasks/KanbanColumn";
import SprintHeader from "@/apps/project-management/components/projects/SprintPanel";
import SprintPlanningView from "@/apps/project-management/components/projects/SprintPlanningView";
import SprintSwimLanes from "@/apps/project-management/components/projects/SprintSwimLanes";
import { cn } from "@/shared/lib/utils";
import { getSprintStatus } from "@/shared/lib/constants";
import { useSprints, useSprintDetail } from "@/apps/project-management/hooks/useSprints";

export default function SprintView({
  workspaceId,
  boardId,
  allTasks,
  statuses,
  members,
  labelsById,
  onTaskClick,
  onAddTask,
  selectedTaskId,
  selectedIds,
  onToggleSelect,
  canEdit,
  onDragEnd,
}) {
  const [activeSprintId, setActiveSprintId] = useState(null);
  const [sprintView, setSprintView] = useState("columns");

  const { data: sprints = [] } = useSprints(workspaceId, boardId);

  // Always reflects the latest server state — never a stale snapshot.
  const { data: activeSprint = null } = useSprintDetail(
    workspaceId,
    boardId,
    activeSprintId,
  );

  const tasks = useMemo(() => {
    if (!activeSprint) return allTasks;
    return allTasks.filter((t) => t.sprint_id === activeSprint.id);
  }, [allTasks, activeSprint]);

  const backlogTasks = useMemo(
    () => allTasks.filter((t) => !t.sprint_id),
    [allTasks],
  );

  const tasksByStatus = (statusId) =>
    tasks
      .filter((t) => t.status_id === statusId)
      .sort((a, b) => a.order - b.order);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <SprintHeader
        workspaceId={workspaceId}
        boardId={boardId}
        activeSprint={activeSprint}
        onSelectSprint={(s) => setActiveSprintId(s?.id ?? null)}
        sprintView={sprintView}
        onSprintViewChange={setSprintView}
      />

      {activeSprint?.status === "planning" && (
        <SprintPlanningView
          backlogTasks={backlogTasks}
          stagedTasks={tasks}
          sprint={activeSprint}
          members={members}
          onTaskClick={onTaskClick}
          labelsById={labelsById}
          workspaceId={workspaceId}
          boardId={boardId}
        />
      )}

      {(activeSprint?.status === "active" ||
        activeSprint?.status === "completed") && (
        <>
          {sprintView === "columns" && (
            <div className="flex-1 overflow-x-auto p-6">
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-5 h-full items-start">
                  {statuses?.map((col) => (
                    <KanbanColumn
                      key={col.id}
                      column={col}
                      tasks={tasksByStatus(col.id)}
                      onAddTask={onAddTask}
                      onTaskClick={(task) => onTaskClick(task.id)}
                      selectedTaskId={selectedTaskId}
                      selectedIds={selectedIds}
                      onToggleSelect={onToggleSelect}
                      workspaceId={workspaceId}
                      boardId={boardId}
                      canEdit={canEdit}
                      labelsById={labelsById}
                    />
                  ))}
                </div>
              </DragDropContext>
            </div>
          )}

          {sprintView === "swimlanes" && (
            <SprintSwimLanes
              tasks={tasks}
              statuses={statuses || []}
              members={members}
              onTaskClick={onTaskClick}
            />
          )}
        </>
      )}

      {!activeSprint && (
        <SprintPicker
          sprints={sprints}
          onSelectSprint={(s) => setActiveSprintId(s.id)}
        />
      )}
    </div>
  );
}

// Fast in-body sprint selector — lets people jump into a sprint without
// having to open the header dropdown first.
function SprintPicker({ sprints, onSelectSprint }) {
  if (sprints.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No sprints yet. Create one above to get started.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <p className="text-xs font-medium text-muted-foreground mb-3">
        Select a sprint to get started
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sprints.map((sprint) => {
          const cfg = getSprintStatus(sprint.status);
          const pct =
            sprint.task_count > 0
              ? Math.round((sprint.completed_count / sprint.task_count) * 100)
              : 0;
          return (
            <button
              key={sprint.id}
              onClick={() => onSelectSprint(sprint)}
              className="flex flex-col gap-2 text-left p-4 rounded border bg-card hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                  <span className="font-semibold text-sm truncate">
                    {sprint.name}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0",
                    cfg.badgeCls,
                  )}
                >
                  {cfg.label}
                </span>
              </div>

              {sprint.goal && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {sprint.goal}
                </p>
              )}

              {sprint.task_count > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums flex-shrink-0">
                    {sprint.completed_count}/{sprint.task_count}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
