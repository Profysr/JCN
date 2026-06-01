import { useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext } from "@hello-pangea/dnd";
import { useProject } from "@/hooks/useProjects";
import { useTasks, useMoveTask, useUpdateTask } from "@/hooks/useTasks";
import { useLabels, useCreateLabel } from "@/hooks/useLabels";
import { useMembers } from "@/hooks/useMembers";
import { useProjectFields } from "@/hooks/useCustomFields";
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from "@/hooks/useSavedViews";
import { useSprints } from "@/hooks/useSprints";
import { useWorkspaceSocket } from "@/hooks/useWorkspaceSocket";
import KanbanColumn from "@/components/tasks/KanbanColumn";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import FilterBar from "@/components/tasks/FilterBar";
import ListView from "@/components/tasks/ListView";
import SprintPanel from "@/components/projects/SprintPanel";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, LayoutGrid, List, Zap, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import BulkActionBar from "@/components/tasks/BulkActionBar";
import { useBulkUpdateTasks } from "@/hooks/useBulkActions";
import api from "@/lib/api";

const EMPTY_FILTERS = { search: "", priorities: [], assignees: [], labels: [] };

export default function KanbanPage() {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: project }   = useProject(workspaceSlug, projectId);
  const { data: allTasks = [] } = useTasks(workspaceSlug, projectId);
  const { data: labels = [] }   = useLabels(workspaceSlug, projectId);
  const { data: members = [] }  = useMembers(workspaceSlug);
  const { data: fields = [] }   = useProjectFields(workspaceSlug, projectId);
  const { data: savedViews = [] } = useSavedViews(workspaceSlug, projectId);
  const { data: sprints = [] }  = useSprints(workspaceSlug, projectId);

  const moveTask    = useMoveTask(workspaceSlug, projectId);
  const updateTask  = useUpdateTask(workspaceSlug, projectId);
  const createLabel = useCreateLabel(workspaceSlug, projectId);
  const createView  = useCreateSavedView(workspaceSlug, projectId);
  const deleteView  = useDeleteSavedView(workspaceSlug, projectId);

  const [createModal, setCreateModal]   = useState({ open: false, statusId: null });
  const [selectedTaskId, setSelectedTaskId] = useState(() => searchParams.get("task") || null);
  const [view, setView]     = useState("kanban"); // "kanban" | "list" | "sprint"
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [activeSprint, setActiveSprint] = useState(() => sprints.find(s => s.status === "active") || null);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const bulkUpdate = useBulkUpdateTasks(workspaceSlug, projectId);

  const toggleSelect = (taskId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  const handleExport = async () => {
    try {
      const resp = await api.get(
        `/api/workspaces/${workspaceSlug}/projects/${projectId}/tasks/export/`,
        { responseType: "blob" },
      );
      const url  = URL.createObjectURL(new Blob([resp.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href     = url;
      link.download = `${project?.name || "tasks"}-tasks.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore — network errors show in console
    }
  };

  useWorkspaceSocket(workspaceSlug);

  const openTask  = (taskId) => { setSelectedTaskId(taskId); setSearchParams({ task: taskId }, { replace: true }); };
  const closeTask = () => { setSelectedTaskId(null); setSearchParams({}, { replace: true }); };

  // Sprint mode: filter tasks by selected sprint
  const tasks = useMemo(() => {
    if (view === "sprint" && activeSprint) {
      return allTasks.filter(t => t.sprint_detail?.id === activeSprint.id);
    }
    return allTasks;
  }, [allTasks, view, activeSprint]);

  const backlogTasks = useMemo(() =>
    view === "sprint" ? allTasks.filter(t => !t.sprint_detail) : [],
    [allTasks, view]
  );

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filters.search)           result = result.filter(t => t.title.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.priorities.length) result = result.filter(t => filters.priorities.includes(t.priority));
    if (filters.assignees.length)  result = result.filter(t => filters.assignees.includes(t.assignee?.id));
    if (filters.labels.length)     result = result.filter(t => t.labels?.some(l => filters.labels.includes(l.id)));
    return result;
  }, [tasks, filters]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    moveTask.mutate({ taskId: result.draggableId, status_id: result.destination.droppableId, order: result.destination.index });
  };

  const tasksByStatus = (statusId) =>
    filteredTasks.filter(t => t.status_detail?.id === statusId).sort((a, b) => a.order - b.order);

  const addTaskToSprint = (task) => {
    if (!activeSprint) return;
    updateTask.mutate({ taskId: task.id, sprint_id: activeSprint.id });
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 bg-card/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/w/${workspaceSlug}/projects`)}
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-accent transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-bold text-base leading-tight">{project?.name}</h1>
              {project?.description && (
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Segmented view toggle */}
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
              {[
                { id: "kanban", icon: LayoutGrid, label: "Board"  },
                { id: "list",   icon: List,       label: "List"   },
                { id: "sprint", icon: Zap,        label: "Sprint" },
              ].map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-150",
                    view === id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            <button
              onClick={handleExport}
              className="p-1.5 rounded-md border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              title="Export to CSV"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <Button size="sm" onClick={() => setCreateModal({ open: true, statusId: project?.statuses?.[0]?.id })}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Task
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          members={members}
          labels={labels}
          savedViews={savedViews}
          onSaveView={(data) => createView.mutate(data)}
          onDeleteView={(id) => deleteView.mutate(id)}
        />

        {/* Board */}
        {view === "kanban" && (
          <div className="flex-1 overflow-x-auto p-6">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-5 h-full">
                {project?.statuses?.map(col => (
                  <KanbanColumn key={col.id} column={col} tasks={tasksByStatus(col.id)}
                    onAddTask={statusId => setCreateModal({ open: true, statusId })}
                    onTaskClick={task => openTask(task.id)} selectedTaskId={selectedTaskId}
                    selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                ))}
              </div>
            </DragDropContext>
          </div>
        )}

        {view === "list" && (
          <ListView tasks={filteredTasks} statuses={project?.statuses || []}
            onTaskClick={task => openTask(task.id)} selectedTaskId={selectedTaskId}
            selectedIds={selectedIds} onToggleSelect={toggleSelect} />
        )}

        {view === "sprint" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Sprint tasks on kanban */}
            <div className="flex-1 overflow-x-auto p-6">
              <DragDropContext onDragEnd={handleDragEnd}>
                <div className="flex gap-5 h-full">
                  {project?.statuses?.map(col => (
                    <KanbanColumn key={col.id} column={col} tasks={tasksByStatus(col.id)}
                      onAddTask={statusId => setCreateModal({ open: true, statusId })}
                      onTaskClick={task => openTask(task.id)} selectedTaskId={selectedTaskId}
                      selectedIds={selectedIds} onToggleSelect={toggleSelect} />
                  ))}
                </div>
              </DragDropContext>
            </div>
            {/* Backlog — tasks not in sprint */}
            {backlogTasks.length > 0 && (
              <div className="border-t px-6 py-3 flex-shrink-0 max-h-52 overflow-y-auto">
                <p className="text-xs font-medium text-muted-foreground mb-2">Backlog ({backlogTasks.length})</p>
                <div className="space-y-1">
                  {backlogTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-3 text-sm py-1 px-2 rounded hover:bg-accent group">
                      <span className="flex-1 truncate">{task.title}</span>
                      {activeSprint && (
                        <button
                          onClick={() => addTaskToSprint(task)}
                          className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          + Add to sprint
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sprint panel (right side in sprint mode) */}
      {view === "sprint" && (
        <SprintPanel
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          activeSprint={activeSprint}
          onSelectSprint={setActiveSprint}
        />
      )}

      {/* Bulk action bar */}
      <BulkActionBar
        count={selectedIds.size}
        statuses={project?.statuses || []}
        members={members}
        onUpdate={(updates) => bulkUpdate.mutate({ task_ids: [...selectedIds], action: "update", updates })}
        onDelete={() => { bulkUpdate.mutate({ task_ids: [...selectedIds], action: "delete" }); setSelectedIds(new Set()); }}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Task Detail Panel */}
      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          projectStatuses={project?.statuses || []}
          projectLabels={labels}
          projectFields={fields}
          onCreateLabel={(data, opts) => createLabel.mutate(data, opts)}
          onClose={closeTask}
        />
      )}

      <CreateTaskModal
        open={createModal.open}
        onClose={() => setCreateModal({ open: false, statusId: null })}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        defaultStatusId={createModal.statusId}
      />
    </div>
  );
}
