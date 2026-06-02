import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext } from "@hello-pangea/dnd";
import { useProject } from "@/hooks/useProjects";
import { useTasks, useMoveTask, useUpdateTask } from "@/hooks/useTasks";
import { useLabels, useCreateLabel } from "@/hooks/useLabels";
import { useMembers } from "@/hooks/useMembers";
import { useCreateStatus } from "@/hooks/useStatusManagement";
import { useProjectFields } from "@/hooks/useCustomFields";
import { useSavedViews, useCreateSavedView, useDeleteSavedView } from "@/hooks/useSavedViews";
import { useSprints } from "@/hooks/useSprints";
import { useWorkspaceSocket } from "@/hooks/useWorkspaceSocket";
import { useProjectPermissions } from "@/hooks/useProjectPermissions";
import KanbanColumn from "@/components/tasks/KanbanColumn";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import TaskDetailPanel from "@/components/tasks/TaskDetailPanel";
import FilterBar from "@/components/tasks/FilterBar";
import ListView from "@/components/tasks/ListView";
import SprintPanel from "@/components/projects/SprintPanel";
import BoardSettingsModal from "@/components/projects/BoardSettingsModal";
import ProjectMembersModal from "@/components/projects/ProjectMembersModal";
import BulkActionBar from "@/components/tasks/BulkActionBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { Plus, ArrowLeft, Download, Settings2, Users, Lock, LayoutGrid, List, Zap, CalendarDays, GanttChartSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBulkUpdateTasks } from "@/hooks/useBulkActions";
import api from "@/lib/api";

const EMPTY_FILTERS = { search: "", priorities: [], assignees: [], labels: [], types: [], due: [] };

const VIEW_OPTIONS = [
  { id: "kanban",   icon: LayoutGrid,       label: "Board"    },
  { id: "list",     icon: List,             label: "List"     },
  { id: "sprint",   icon: Zap,              label: "Sprint"   },
  { id: "calendar", icon: CalendarDays,     label: "Calendar" },
  { id: "timeline", icon: GanttChartSquare, label: "Timeline" },
];

const COLUMN_COLORS = ["#94a3b8","#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e","#3b82f6"];

function AddColumnButton({ workspaceSlug, projectId }) {
  const [adding, setAdding] = useState(false);
  const [name, setName]     = useState("");
  const createStatus = useCreateStatus(workspaceSlug, projectId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const color = COLUMN_COLORS[Math.floor(Math.random() * COLUMN_COLORS.length)];
    createStatus.mutate(
      { name: name.trim(), color, is_done: false },
      { onSuccess: () => { setName(""); setAdding(false); } }
    );
  };

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 transition-colors w-[180px] flex-shrink-0"
      >
        <Plus className="w-3.5 h-3.5" /> Add column
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-[272px] flex-shrink-0">
      <div className="bg-card border rounded-t-md border-t-[3px] px-2 py-2" style={{ borderTopColor: "#6366f1" }}>
        <input
          autoFocus
          className="w-full text-sm bg-background border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Column name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}
        />
        <div className="flex gap-1.5 mt-2">
          <button type="submit" disabled={!name.trim() || createStatus.isPending}
            className="flex-1 text-xs py-1.5 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50">
            {createStatus.isPending ? "Adding…" : "Add column"}
          </button>
          <button type="button" onClick={() => setAdding(false)}
            className="px-2 text-xs border rounded-md text-muted-foreground hover:bg-accent transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

export default function KanbanPage() {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: project }   = useProject(workspaceSlug, projectId);
  const { data: allTasks = [] } = useTasks(workspaceSlug, projectId);
  const { data: labels = [] }   = useLabels(workspaceSlug, projectId);
  const { data: members = [] }  = useMembers(workspaceSlug);
  const { data: fields = [] }   = useProjectFields(workspaceSlug, projectId);
  const { data: sprints = [] }  = useSprints(workspaceSlug, projectId);
  const perms = useProjectPermissions(workspaceSlug, projectId);

  const moveTask    = useMoveTask(workspaceSlug, projectId);
  const updateTask  = useUpdateTask(workspaceSlug, projectId);
  const createLabel = useCreateLabel(workspaceSlug, projectId);

  const { data: savedViews = [] } = useSavedViews(workspaceSlug, projectId);
  const createView = useCreateSavedView(workspaceSlug, projectId);
  const deleteView = useDeleteSavedView(workspaceSlug, projectId);

  const [createModal, setCreateModal]   = useState({ open: false, statusId: null });
  const [boardSettings, setBoardSettings] = useState(false);
  const [membersModal, setMembersModal]   = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(() => searchParams.get("task") || null);
  const [view, setView]       = useState("kanban");
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
    const today = new Date(); today.setHours(0,0,0,0);
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    let result = tasks;
    if (filters.search)               result = result.filter(t => t.title.toLowerCase().includes(filters.search.toLowerCase()));
    if (filters.priorities?.length)   result = result.filter(t => filters.priorities.includes(t.priority));
    if (filters.assignees?.length)    result = result.filter(t => filters.assignees.includes(t.assignee?.id));
    if (filters.labels?.length)       result = result.filter(t => t.labels?.some(l => filters.labels.includes(l.id)));
    if (filters.types?.length)        result = result.filter(t => filters.types.includes(t.task_type));
    if (filters.due?.length) {
      result = result.filter(t => {
        if (!t.due_date && filters.due.includes("no_date")) return true;
        if (!t.due_date) return false;
        const d = new Date(t.due_date + "T00:00:00");
        if (filters.due.includes("overdue")   && d < today)               return true;
        if (filters.due.includes("today")     && d.getTime() === today.getTime()) return true;
        if (filters.due.includes("this_week") && d >= today && d <= weekEnd) return true;
        return false;
      });
    }
    return result;
  }, [tasks, filters]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (!perms.canEdit) return; // Viewers cannot reorder tasks
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
              className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base leading-tight">{project?.name}</h1>
                {project?.is_private && (
                  <Tooltip content="Private project">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </Tooltip>
                )}
                {perms.isLoaded && (
                  <Badge variant="muted" size="sm" className="capitalize">{perms.role}</Badge>
                )}
              </div>
              {project?.description && (
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip content="Project members & access">
              <button
                onClick={() => setMembersModal(true)}
                className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
              >
                <Users className="w-4 h-4" />
              </button>
            </Tooltip>

            {perms.canAdmin && (
              <Tooltip content="Board settings">
                <button
                  onClick={() => setBoardSettings(true)}
                  className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              </Tooltip>
            )}

            <Tooltip content="Export CSV">
              <button
                onClick={handleExport}
                className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
              >
                <Download className="w-4 h-4" />
              </button>
            </Tooltip>

            {perms.canEdit && (
              <Button size="sm" onClick={() => setCreateModal({ open: true, statusId: project?.statuses?.[0]?.id })}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Task
              </Button>
            )}
          </div>
        </div>

        {/* View toggle + filter bar — single row */}
        <div className="flex items-center gap-2 px-5 border-b bg-background flex-shrink-0 min-h-[46px]">
          {/* View selector */}
          <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5 flex-shrink-0">
            {VIEW_OPTIONS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  view === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-border/60 flex-shrink-0" />

          {/* Filter controls */}
          <FilterBar
            filters={filters}
            onChange={setFilters}
            members={members}
            labels={labels}
            savedViews={savedViews}
            onSaveView={(data) => createView.mutate(data)}
            onDeleteView={(id) => deleteView.mutate(id)}
            inline
          />
        </div>

        {/* Board */}
        {view === "kanban" && (
          <div className="flex-1 overflow-x-auto p-6">
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="flex gap-5 h-full items-start">
                {project?.statuses?.map(col => (
                  <KanbanColumn key={col.id} column={col} tasks={tasksByStatus(col.id)}
                    onAddTask={statusId => setCreateModal({ open: true, statusId })}
                    onTaskClick={task => openTask(task.id)} selectedTaskId={selectedTaskId}
                    selectedIds={selectedIds} onToggleSelect={toggleSelect}
                    workspaceSlug={workspaceSlug} projectId={projectId} canEdit={perms.canEdit} />
                ))}
                {/* Add column button */}
                {perms.canEdit && (
                  <AddColumnButton workspaceSlug={workspaceSlug} projectId={projectId} />
                )}
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
                      selectedIds={selectedIds} onToggleSelect={toggleSelect}
                      workspaceSlug={workspaceSlug} projectId={projectId} canEdit={perms.canEdit} />
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

      {/* Calendar / Timeline — coming soon placeholders */}
      {(view === "calendar" || view === "timeline") && (
        <div className="flex-1 flex items-center justify-center text-center p-12">
          <div>
            <div className="text-4xl mb-3">{view === "calendar" ? "📅" : "📊"}</div>
            <p className="text-sm font-semibold text-foreground mb-1 capitalize">{view} view</p>
            <p className="text-xs text-muted-foreground">Coming in Phase 3 — Timeline &amp; Calendar views.</p>
          </div>
        </div>
      )}

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
          canEdit={perms.canEdit}
        />
      )}

      <CreateTaskModal
        open={createModal.open}
        onClose={() => setCreateModal({ open: false, statusId: null })}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        defaultStatusId={createModal.statusId}
        statuses={project?.statuses || []}
        members={members}
      />

      <BoardSettingsModal
        open={boardSettings}
        onClose={() => setBoardSettings(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        statuses={project?.statuses || []}
      />

      <ProjectMembersModal
        open={membersModal}
        onClose={() => setMembersModal(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        project={project}
        canAdmin={perms.canAdmin}
      />

    </div>
  );
}
