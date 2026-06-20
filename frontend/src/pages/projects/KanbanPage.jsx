import { lazy, Suspense, useState, useMemo, useEffect } from "react";
import { Loader } from "@/components/ui/Loader";
import { ModalSkeleton } from "@/components/ui/Modal";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext } from "@hello-pangea/dnd";
import { useBoard } from "@/hooks/useProjects";
import { useTasks, useMoveTask } from "@/hooks/useTasks";
import { useDebounce } from "@/hooks/useDebounce";
import { useLabels, useCreateLabel } from "@/hooks/useLabels";
import { useMembers } from "@/hooks/useMembers";
import { useStatuses } from "@/hooks/useStatusManagement";
import {
  useSavedViews,
  useCreateSavedView,
  useDeleteSavedView,
} from "@/hooks/useSavedViews";
import { useSprints } from "@/hooks/useSprints";
import { useWorkspaceSocket } from "@/hooks/useWorkspaceSocket";
import { useBoardPermissions } from "@/hooks/useProjectPermissions";
import { usePresence, useAnnouncePresence } from "@/hooks/usePresence";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";
import KanbanColumn from "@/components/tasks/KanbanColumn";
import CreateTaskModal from "@/components/tasks/CreateTaskModal";
import FilterBar from "@/components/tasks/FilterBar";
import ListView from "@/components/tasks/ListView";
import BoardSettingsModal from "@/components/projects/BoardSettingsModal";
import ProjectMembersModal from "@/components/projects/ProjectMembersModal";
import BulkActionBar from "@/components/tasks/BulkActionBar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { OnlineUsersIndicator } from "@/components/ui/OnlineUsersIndicator";
import {
  Plus,
  ArrowLeft,
  Settings2,
  Users,
  Lock,
  LayoutGrid,
  List,
  Zap,
  CalendarDays,
  GanttChartSquare,
  BookOpen,
  FormInput,
} from "lucide-react";

// Lazy — only rendered when the user switches to that view
const CalendarView = lazy(() => import("@/components/tasks/CalendarView"));
const GanttView = lazy(() => import("@/components/tasks/GanttView"));
const SprintView = lazy(() => import("@/components/projects/SprintView"));
const TaskDetailPanel = lazy(
  () => import("@/components/tasks/TaskDetailPanel"),
);
import { cn } from "@/lib/utils";
import { useBulkUpdateTasks } from "@/hooks/useBulkActions";

const EMPTY_FILTERS = {
  search: "",
  priorities: [],
  assignees: [],
  labels: [],
  types: [],
  due: [],
  pendingMyApproval: false,
};

const VIEW_OPTIONS = [
  { id: "kanban", icon: LayoutGrid, label: "Board" },
  { id: "list", icon: List, label: "Table" },
  { id: "sprint", icon: Zap, label: "Sprint" },
  { id: "calendar", icon: CalendarDays, label: "Calendar" },
  { id: "timeline", icon: GanttChartSquare, label: "Timeline" },
];

// const COLUMN_COLORS = ["#94a3b8", ...APP_COLORS];

// function AddColumnButton({ workspaceId, boardId }) {
//   const [adding, setAdding] = useState(false);
//   const [name, setName] = useState("");
//   const createStatus = useCreateStatus(workspaceId, boardId);

//   const handleSubmit = (e) => {
//     e.preventDefault();
//     if (!name.trim()) return;
//     const color =
//       COLUMN_COLORS[Math.floor(Math.random() * COLUMN_COLORS.length)];
//     createStatus.mutate(
//       { name: name.trim(), color, is_done: false },
//       {
//         onSuccess: () => {
//           setName("");
//           setAdding(false);
//         },
//       },
//     );
//   };

//   if (!adding) {
//     return (
//       <button
//         onClick={() => setAdding(true)}
//         className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/40 transition-colors w-[180px] flex-shrink-0"
//       >
//         <Plus className="w-3.5 h-3.5" /> Add column
//       </button>
//     );
//   }

//   return (
//     <form onSubmit={handleSubmit} className="w-[272px] flex-shrink-0">
//       <div
//         className="bg-card border rounded-t-md border-t-[3px] px-2 py-2"
//         style={{ borderTopColor: "#6366f1" }}
//       >
//         <input
//           autoFocus
//           className="w-full text-sm bg-background border rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
//           placeholder="Column name…"
//           value={name}
//           onChange={(e) => setName(e.target.value)}
//           onKeyDown={(e) => {
//             if (e.key === "Escape") setAdding(false);
//           }}
//         />
//         <div className="flex gap-1.5 mt-2">
//           <button
//             type="submit"
//             disabled={!name.trim() || createStatus.isPending}
//             className="flex-1 text-xs py-1.5 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50"
//           >
//             {createStatus.isPending ? "Adding…" : "Add column"}
//           </button>
//           <button
//             type="button"
//             onClick={() => setAdding(false)}
//             className="px-2 text-xs border rounded-md text-muted-foreground hover:bg-accent transition-colors"
//           >
//             Cancel
//           </button>
//         </div>
//       </div>
//     </form>
//   );
// }

export default function KanbanPage() {
  const navigate = useNavigate();
  const { workspaceId, boardId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const { user } = useAuthStore();
  const { toast } = useToast();

  const [view, setView] = useState("kanban");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debouncedSearch = useDebounce(filters.search, 350);
  const apiFilters = { ...filters, search: debouncedSearch };

  const {
    data: board,
    isError: boardError,
    error: boardErrorDetail,
  } = useBoard(workspaceId, boardId);
  const { data: allTasks = [] } = useTasks(workspaceId, boardId, apiFilters);
  const { data: labels = [] } = useLabels(workspaceId, boardId);
  const { data: members = [] } = useMembers(workspaceId);
  // Only fetch sprints when view is sprint, list or timeline cz we won't need it in board view
  const { data: sprints = [] } = useSprints(
    workspaceId,
    boardId,
    view === "sprint" || view === "list" || view === "timeline",
  );
  const { data: statuses = [] } = useStatuses(workspaceId, boardId);
  const perms = useBoardPermissions(workspaceId, boardId);

  const moveTask = useMoveTask(workspaceId, boardId);
  const createLabel = useCreateLabel(workspaceId, boardId);
  const bulkUpdate = useBulkUpdateTasks(workspaceId, boardId);

  const { data: savedViews = [] } = useSavedViews(workspaceId, boardId);
  const createView = useCreateSavedView(workspaceId, boardId);
  const deleteView = useDeleteSavedView(workspaceId, boardId);

  const [createModal, setCreateModal] = useState({
    open: false,
    statusId: null,
    date: null,
  });
  const [boardSettings, setBoardSettings] = useState(false);
  const [membersModal, setMembersModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState(
    () => searchParams.get("task") || null,
  );
  const [focusCommentId, setFocusCommentId] = useState(
    () => searchParams.get("comment") || null,
  );

  // Automatically get the task id from param and opens up the task
  useEffect(() => {
    setSelectedTaskId(searchParams.get("task") || null);
    setFocusCommentId(searchParams.get("comment") || null);
  }, [searchParams]);

  // Use for bulk updates
  const [selectedIds, setSelectedIds] = useState(new Set());

  const toggleSelect = (taskId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  };

  useWorkspaceSocket(workspaceId);

  // v3.5.0 — announce presence for this board board
  useAnnouncePresence(workspaceId, "board", boardId);
  const { data: boardPresence = [] } = usePresence(
    workspaceId,
    "board",
    boardId,
  );

  // v3.9.0 — `c` shortcut creates a task in the current board
  useEffect(() => {
    const handler = () =>
      setCreateModal({ open: true, statusId: null, date: null });
    window.addEventListener("jcn:create-task", handler);
    return () => window.removeEventListener("jcn:create-task", handler);
  }, []);

  // Map task-scoped presence to individual task cards
  // const taskViewerMap = useMemo(() => {
  //   const map = {};
  //   boardPresence
  //     .filter((p) => p.resource_type === "task")
  //     .forEach((p) => {
  //       (map[p.resource_id] ||= []).push(p);
  //     });
  //   return map;
  // }, [boardPresence]);

  const openTask = (taskId) => {
    setSelectedTaskId(taskId);
    setSearchParams({ task: taskId }, { replace: true });
  };
  const closeTask = () => {
    setSelectedTaskId(null);
    setSearchParams({}, { replace: true });
  };

  const labelsById = useMemo(
    () => Object.fromEntries(labels.map((l) => [l.id, l])),
    [labels],
  );
  const sprintsById = useMemo(
    () => Object.fromEntries(sprints.map((s) => [s.id, s])),
    [sprints],
  );

  const tasks = allTasks;

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    if (!perms.canEdit) return;

    const { draggableId, source, destination } = result;

    // No-op: dropped back in the exact same spot.
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    // Mirrors the server-side check such as if the user grabbed and place task into same column, or a task is moved to complete column even has pending approvals, return for these scenarios
    if (source.droppableId !== destination.droppableId) {
      const destStatus = statuses?.find(
        (s) => s.id === destination.droppableId,
      );
      if (destStatus?.is_done) {
        const task = tasks.find((t) => t.id === draggableId);
        if (task?.pending_approval_count > 0) {
          toast({
            title: "Approval required",
            description:
              "Resolve pending approvals before marking this task done.",
            type: "error",
          });
          return;
        }
      }
    }

    moveTask.mutate(
      {
        taskId: draggableId,
        status_id: destination.droppableId,
        order: destination.index,
      },
      {
        onError: (err) => {
          if (err?.response?.data?.approval_required) {
            toast({
              title: "Approval required",
              description:
                "Resolve pending approvals before marking this task done.",
              type: "error",
            });
          }
        },
      },
    );
  };

  // Helps us to determine the column of s task
  const tasksByStatus = (statusId) =>
    tasks
      .filter((t) => t.status_id === statusId)
      .sort((a, b) => a.order - b.order);

  if (boardError) {
    const is403 = boardErrorDetail?.response?.status === 403;
    const is404 = boardErrorDetail?.response?.status === 404;
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-3 max-w-sm px-4">
          <div className="flex justify-center">
            <div className="p-4 rounded-full bg-muted">
              <Lock className="w-7 h-7 text-muted-foreground" />
            </div>
          </div>
          <h2 className="text-base font-semibold">
            {is404 ? "Board not found" : "Access denied"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {is403 || is404
              ? "This board is private. Ask a board admin to add you as a member."
              : "You don't have permission to view this board."}
          </p>
          <button
            onClick={() => navigate(`/w/${workspaceId}/boards`)}
            className="text-sm text-primary hover:underline"
          >
            Back to boards
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 bg-card/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/w/${workspaceId}/boards`)}
              className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base leading-tight">
                  {board?.name}
                </h1>
                {board?.is_private && (
                  <Tooltip content="Private board">
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </Tooltip>
                )}
                {perms.isLoaded && (
                  <Badge variant="muted" size="sm" className="capitalize">
                    {perms.role}
                  </Badge>
                )}

                <OnlineUsersIndicator users={boardPresence} />
              </div>
              {board?.description && (
                <p className="text-xs text-muted-foreground leading-tight mt-0.5">
                  {board.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Sub-feature nav — Wiki, Forms, Automations */}
            <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5 mr-1">
              {[
                { label: "Wiki", Icon: BookOpen, path: "wiki" },
                { label: "Forms", Icon: FormInput, path: "forms" },
                // ‼️ { label: "Automations", Icon: Zap, path: "automations" },
              ].map(({ label, Icon, path }) => (
                <Tooltip key={path} content={label}>
                  <button
                    onClick={() =>
                      navigate(`/w/${workspaceId}/boards/${boardId}/${path}`)
                    }
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-colors active:scale-[0.97]"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </Tooltip>
              ))}
            </div>

            {/* Action buttons */}
            {[
              {
                label: "Board members & access",
                Icon: Users,
                onClick: () => setMembersModal(true),
                show: true,
              },
              {
                label: "Board settings",
                Icon: Settings2,
                onClick: () => setBoardSettings(true),
                show: perms.canAdmin,
              },
            ]
              .filter(({ show }) => show)
              .map(({ label, Icon, onClick }) => (
                <Tooltip key={label} content={label}>
                  <button
                    onClick={onClick}
                    className="p-2 rounded-lg bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </Tooltip>
              ))}

            {perms.canEdit && (
              <Button
                size="sm"
                onClick={() =>
                  setCreateModal({
                    open: true,
                    statusId: statuses?.[0]?.id,
                  })
                }
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Task
              </Button>
            )}
          </div>
        </div>

        {/* View toggle + filter bar — single row */}
        <div className="flex items-center gap-2 px-5 border-b bg-background flex-shrink-0 min-h-[46px]">
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
            currentUserId={user?.id}
          />

          <div className="w-px h-4 bg-border/60 flex-shrink-0" />

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
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Board */}
        {view === "kanban" && (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex-1 overflow-x-auto p-6">
              <div className="flex gap-5 h-full items-start">
                {statuses?.map((col) => (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    tasks={tasksByStatus(col.id)}
                    onAddTask={(statusId) =>
                      setCreateModal({ open: true, statusId })
                    }
                    onTaskClick={(task) => openTask(task.id)}
                    selectedTaskId={selectedTaskId}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    workspaceId={workspaceId}
                    boardId={boardId}
                    canEdit={perms.canEdit}
                    labelsById={labelsById}
                  />
                ))}
              </div>
            </div>
          </DragDropContext>
        )}

        {view === "list" && (
          <ListView
            tasks={tasks}
            statuses={statuses || []}
            members={members}
            labelsById={labelsById}
            sprintsById={sprintsById}
            onTaskClick={(id) => openTask(id)}
            selectedTaskId={selectedTaskId}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            workspaceId={workspaceId}
            boardId={boardId}
          />
        )}

        {view === "sprint" && (
          <Suspense fallback={<Loader className="flex-1" />}>
            <SprintView
              workspaceId={workspaceId}
              boardId={boardId}
              allTasks={allTasks}
              statuses={statuses || []}
              members={members}
              labelsById={labelsById}
              onTaskClick={openTask}
              onAddTask={(statusId) => setCreateModal({ open: true, statusId })}
              selectedTaskId={selectedTaskId}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              canEdit={perms.canEdit}
              onDragEnd={handleDragEnd}
            />
          </Suspense>
        )}

        {/* Calendar View (v2.9.0) */}
        {view === "calendar" && (
          <Suspense fallback={<Loader className="flex-1" />}>
            <CalendarView
              tasks={tasks}
              statuses={statuses || []}
              onTaskClick={openTask}
              onCreateTask={(date) =>
                setCreateModal({ open: true, statusId: null, date })
              }
              workspaceId={workspaceId}
              boardId={boardId}
              canEdit={perms.canEdit}
            />
          </Suspense>
        )}

        {/* Timeline / Gantt View (v3.0.0) */}
        {view === "timeline" && (
          <Suspense fallback={<Loader className="flex-1" />}>
            <GanttView
              tasks={tasks}
              statuses={statuses || []}
              members={members}
              sprints={sprints}
              onTaskClick={openTask}
              workspaceId={workspaceId}
              boardId={boardId}
              canEdit={perms.canEdit}
            />
          </Suspense>
        )}
      </div>

      {/* Bulk action bar */}
      <BulkActionBar
        count={selectedIds.size}
        statuses={statuses || []}
        members={members}
        onUpdate={(updates) =>
          bulkUpdate.mutate({
            task_ids: [...selectedIds],
            action: "update",
            updates,
          })
        }
        onDelete={() => {
          bulkUpdate.mutate({ task_ids: [...selectedIds], action: "delete" });
          setSelectedIds(new Set());
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Task Detail Panel — lazy; Tiptap/VoltEditor bundle loads on first task open */}
      {selectedTaskId && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={closeTask}
              />
              <div
                className="relative w-full max-w-2xl bg-card border border-border rounded-md shadow-2xl flex items-center justify-center"
                style={{ height: "60vh" }}
              >
                <Loader />
              </div>
            </div>
          }
        >
          <TaskDetailPanel
            taskId={selectedTaskId}
            focusCommentId={focusCommentId}
            projectStatuses={statuses || []}
            taskLabels={labels}
            onCreateLabel={(data, opts) => createLabel.mutate(data, opts)}
            onClose={closeTask}
            canEdit={perms.canEdit}
          />
        </Suspense>
      )}

      <CreateTaskModal
        open={createModal.open}
        onClose={() =>
          setCreateModal({ open: false, statusId: null, date: null })
        }
        workspaceId={workspaceId}
        boardId={boardId}
        defaultStatusId={createModal.statusId}
        defaultDate={createModal.date}
        statuses={statuses || []}
        members={members}
      />

      <BoardSettingsModal
        open={boardSettings}
        onClose={() => setBoardSettings(false)}
        workspaceId={workspaceId}
        boardId={boardId}
        statuses={statuses || []}
      />

      <ProjectMembersModal
        open={membersModal}
        onClose={() => setMembersModal(false)}
        workspaceId={workspaceId}
        boardId={boardId}
        board={board}
        canAdmin={perms.canAdmin}
      />
    </div>
  );
}
