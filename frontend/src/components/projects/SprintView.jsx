import { useState, useMemo } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import KanbanColumn from "@/components/tasks/KanbanColumn";
import SprintHeader from "@/components/projects/SprintPanel";
import SprintPlanningView from "@/components/projects/SprintPlanningView";
import SprintSwimLanes from "@/components/projects/SprintSwimLanes";

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
  const [activeSprint, setActiveSprint] = useState(null);
  const [sprintView, setSprintView] = useState("columns");

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
        onSelectSprint={setActiveSprint}
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

      {(activeSprint?.status === "active" || activeSprint?.status === "completed") && (
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
              labelsById={labelsById}
            />
          )}
        </>
      )}

      {!activeSprint && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Select or create a sprint above to get started.
        </div>
      )}
    </div>
  );
}
