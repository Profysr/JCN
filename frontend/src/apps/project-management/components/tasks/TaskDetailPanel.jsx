import { useState, useRef, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Copy,
  CopyPlus,
  ShieldCheck,
  Trash2,
  ChevronRight,
  X,
  LayoutGrid,
} from "lucide-react";
import { Tooltip } from "@/shared/components/ui/tooltip";
import { ShortcutHint, TooltipLabel } from "@/shared/components/ui/Kbd";
import { Loader } from "@/shared/components/ui/Loader";
import { ConfirmModal } from "@/shared/components/ui/ConfirmModal";
import Modal from "@/shared/components/ui/Modal";
import { cn } from "@/shared/lib/utils";
import VoltEditor from "@/shared/components/ui/VoltEditor";
import { useMembers } from "@/shared/hooks/useMembers";
import { useBoardMembers } from "@/apps/project-management/hooks/useBoardMembers";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/shared/components/ui/toast";
import {
  useDeleteTask,
  useTaskDetail,
  useTaskSubtasks,
  useUpdateTaskDetail,
  useCreateSubtask,
  useToggleSubtask,
  useDeleteSubtask,
} from "@/apps/project-management/hooks/useTasks";
import {
  useChildTasks,
  useCreateChildTask,
  useAttachChildTask,
  useCloneTask,
} from "@/apps/project-management/hooks/useTaskHierarchy";
import {
  useApprovals,
  useRequestApproval,
} from "@/apps/project-management/hooks/useApprovals";
import {
  TaskTitle,
  ChildTasksSection,
  ChecklistSection,
} from "./TaskDetailBody";
import {
  PANEL_ITEMS,
  IconStrip,
  PanelSectionHeader,
  PropertiesPanel,
  AttachmentsPanel,
  DependenciesPanel,
  LayoutPanel,
  RequestApprovalDropdown,
} from "./TaskDetailPanels";
import { ActivityTabsSection } from "./TaskActivityTabs";
import { useBoard } from "@/apps/project-management/hooks/useBoards";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import { workspaceUrl } from "@/shared/lib/navLinks";

const DESC_SIZE_CLASSES = {
  compact: "min-h-[80px]",
  comfortable: "min-h-[160px]",
  expanded: "min-h-[320px]",
};

function getLayoutPrefs() {
  try {
    return JSON.parse(localStorage.getItem("jcn:task-panel-layout") || "{}");
  } catch {
    return {};
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function TaskDetailPanel({
  taskId,
  focusCommentId = null,
  projectStatuses = [],
  taskLabels = [],
  onCreateLabel,
  onClose,
  canEdit = true,
  canDelete = false,
}) {
  const { workspaceId, boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: wsMembers = [] } = useMembers(workspaceId);
  const { data: board } = useBoard(workspaceId, boardId);
  const { data: boardMembers = [] } = useBoardMembers(workspaceId, boardId, {
    enabled: !!board?.is_private,
  });
  const members = board?.is_private ? boardMembers : wsMembers;
  const { data: task, isLoading } = useTaskDetail(workspaceId, boardId, taskId);
  const { data: subtasks = [] } = useTaskSubtasks(workspaceId, boardId, taskId);
  const { data: childTasks = [] } = useChildTasks(workspaceId, boardId, taskId);
  const { data: approvals = [] } = useApprovals(workspaceId, boardId, taskId);
  const update = useUpdateTaskDetail(workspaceId, boardId, taskId);
  const createSubtask = useCreateSubtask(workspaceId, boardId, taskId);
  const toggleSubtask = useToggleSubtask(workspaceId, boardId, taskId);
  const deleteSubtask = useDeleteSubtask(workspaceId, boardId, taskId);
  const deleteTask = useDeleteTask(workspaceId, boardId);
  const createChild = useCreateChildTask(workspaceId, boardId, taskId);
  const attachChild = useAttachChildTask(workspaceId, boardId, taskId);
  const requestApproval = useRequestApproval(workspaceId, boardId, taskId);
  const cloneTask = useCloneTask(workspaceId, boardId);
  const { toast } = useToast();

  const handleClone = useCallback(() => {
    cloneTask.mutate(taskId, {
      onSuccess: (data) => {
        toast.success("Task cloned");
        navigate(`?task=${data.id}`, { replace: true });
      },
    });
  }, [cloneTask, taskId, toast, navigate]);
  const qc = useQueryClient();

  const [layoutPrefs, setLayoutPrefs] = useState(getLayoutPrefs);
  const [activePanel, setActivePanel] = useState(
    () => getLayoutPrefs().defaultPanel ?? "properties",
  );
  // Incremented by the ⇧T keyboard shortcut to tell TaskTitle to enter edit mode.
  const [editTitleSignal, setEditTitleSignal] = useState(0);
  // Incremented by ⇧E to move focus into the description editor.
  const [descFocusSignal, setDescFocusSignal] = useState(0);
  // Bumped by the property shortcuts (⇧S/⇧P/⇧A/⇧L/⇧D) to open the matching
  // dropdown in the Properties side panel. `field` selects which one.
  const [propFocus, setPropFocus] = useState({ field: null, tick: 0 });
  const descEditorRef = useRef(null);
  const [approvalDropdown, setApprovalDropdown] = useState(false);
  const approvalBtnRef = useRef(null);
  const [conflict, setConflict] = useState(null);
  // const [typingUsers, setTypingUsers] = useState([]);   // typing indicators — disabled
  // const typingTimers = useRef({});
  const [confirmState, setConfirmState] = useState(null);

  const updateLayoutPrefs = (patch) => {
    const next = { ...layoutPrefs, ...patch };
    setLayoutPrefs(next);
    localStorage.setItem("jcn:task-panel-layout", JSON.stringify(next));
  };

  const handlePanelSelect = (id) =>
    setActivePanel((cur) => (cur === id ? null : id));

  // useEffect(() => {
  //   const handler = (e) => {
  //     const { task_id, user_id, user_name, is_typing } = e.detail;
  //     if (task_id !== taskId || user_id === user?.id) return;
  //     setTypingUsers((prev) => {
  //       if (is_typing)
  //         return prev.some((u) => u.id === user_id)
  //           ? prev
  //           : [...prev, { id: user_id, name: user_name }];
  //       return prev.filter((u) => u.id !== user_id);
  //     });
  //     if (is_typing) {
  //       clearTimeout(typingTimers.current[user_id]);
  //       typingTimers.current[user_id] = setTimeout(
  //         () => setTypingUsers((prev) => prev.filter((u) => u.id !== user_id)),
  //         4000,
  //       );
  //     }
  //   };
  //   window.addEventListener("jcn:typing", handler);
  //   return () => window.removeEventListener("jcn:typing", handler);
  // }, [taskId, user?.id]);

  // Move focus into the description editor when ⇧E fires.
  useEffect(() => {
    if (descFocusSignal > 0) descEditorRef.current?.focus();
  }, [descFocusSignal]);

  // Escape is now handled centrally by useBoardShortcuts in KanbanPage.
  // This panel only responds to task-action events dispatched from that hook.
  useEffect(() => {
    const handler = (ev) => {
      const { action } = ev.detail ?? {};
      switch (action) {
        case "edit-title":
          setEditTitleSignal((n) => n + 1);
          break;
        case "edit-description":
          setDescFocusSignal((n) => n + 1);
          break;
        case "copy-link": {
          const url = `${window.location.origin}${window.location.pathname}?task=${task?.id}`;
          navigator.clipboard?.writeText(url);
          toast.success("Link copied");
          break;
        }
        case "clone":
          if (canEdit) handleClone();
          break;
        case "open-approval":
          if (canEdit) setApprovalDropdown((v) => !v);
          break;
        case "delete":
          if (canEdit)
            setConfirmState({
              message: "Delete this task? This cannot be undone.",
              onConfirm: () =>
                deleteTask.mutate(taskId, { onSuccess: onClose }),
            });
          break;
        // Property shortcuts — open the Properties panel and pop the dropdown.
        case "status":
        case "priority":
        case "assign":
        case "label":
        case "due-date":
          if (!canEdit) break;
          setActivePanel("properties");
          setPropFocus((p) => ({ field: action, tick: p.tick + 1 }));
          break;
        default:
          break;
      }
    };
    window.addEventListener("jcn:task-action", handler);
    return () => window.removeEventListener("jcn:task-action", handler);
  }, [task?.id, handleClone, canEdit, deleteTask, taskId, onClose, toast]);

  if (isLoading || !task) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        showHeader={false}
        showFooter={false}
        flexBody={true}
        padding="p-0"
        maxWidth="90vw"
      >
        <div className="flex items-center justify-center min-h-[560px]">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X size={15} />
          </button>
          <Loader />
        </div>
      </Modal>
    );
  }

  const descSizeClass =
    DESC_SIZE_CLASSES[layoutPrefs.descriptionSize ?? "comfortable"];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      showHeader={false}
      showFooter={false}
      flexBody={true}
      padding="p-0"
      maxWidth="98vw"
    >
      <PanelHeader
        task={task}
        board={board}
        workspaceId={workspaceId}
        boardId={boardId}
        canEdit={canEdit}
        canDelete={canDelete}
        approvals={approvals}
        approvalDropdown={approvalDropdown}
        setApprovalDropdown={setApprovalDropdown}
        approvalBtnRef={approvalBtnRef}
        members={members}
        requestApproval={requestApproval}
        deleteTask={deleteTask}
        taskId={taskId}
        onClose={onClose}
        toast={toast}
        onDeleteConfirm={(obj) => setConfirmState(obj)}
        onClone={handleClone}
        isCloning={cloneTask.isPending}
      />

      {conflict && (
        <ConflictBanner
          conflict={conflict}
          onDismiss={() => setConflict(null)}
          onReload={() => {
            setConflict(null);
            qc.invalidateQueries({
              queryKey: ["task-detail", workspaceId, boardId, taskId],
            });
          }}
        />
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Main body ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 overflow-y-auto px-2 py-5 space-y-4">
          {task.ancestors?.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {task.ancestors.map((a, i) => (
                <span key={a.id} className="flex items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                  <button
                    onClick={() => navigate(`?task=${a.id}`, { replace: true })}
                    className="text-xs text-muted-foreground hover:text-foreground font-medium hover:underline underline-offset-2"
                  >
                    {a.title}
                  </button>
                </span>
              ))}
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                {task.title}
              </span>
            </div>
          )}

          <TaskTitle
            task={task}
            canEdit={canEdit}
            update={update}
            setConflict={setConflict}
            editSignal={editTitleSignal}
          />

          <div className="rounded-md border border-border bg-muted/20 overflow-hidden">
            <div className="px-3 pt-2.5 pb-1 border-b border-border/40">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Description
              </p>
            </div>
            <div className="px-1 py-1">
              <VoltEditor
                ref={descEditorRef}
                value={task.description || ""}
                onBlur={(md) => {
                  if (md !== task.description)
                    update.mutate({ description: md });
                }}
                readOnly={!canEdit}
                placeholder="Add a description…"
                className={descSizeClass}
              />
            </div>
            {canEdit && (
              <ShortcutHint
                id="task:edit-description"
                label="edit the description"
                className="px-3 pb-1.5"
              />
            )}
          </div>

          {layoutPrefs.showWorkItems !== false && (
            <>
              <ChildTasksSection
                childTasks={childTasks}
                canEdit={canEdit}
                taskId={taskId}
                attachChild={attachChild}
                createChild={createChild}
                navigate={navigate}
                projectStatuses={projectStatuses}
              />
              <ChecklistSection
                task={task}
                subtasks={subtasks}
                canEdit={canEdit}
                toggleSubtask={toggleSubtask}
                deleteSubtask={deleteSubtask}
                createSubtask={createSubtask}
              />
            </>
          )}

          <div className="-mx-6 px-6 pt-5 pb-4 bg-muted/15 border-t border-border">
            <ActivityTabsSection
              workspaceId={workspaceId}
              boardId={boardId}
              taskId={taskId}
              user={user}
              members={members}
              // typingUsers={typingUsers}
              focusCommentId={focusCommentId}
              commentCount={task.comment_count}
              approvals={approvals}
            />
          </div>
        </div>

        {/* ── Side panel — only mounted when a panel is active ──── */}
        {activePanel && (
          <div className="w-72 flex-shrink-0 border-l border-border overflow-y-auto bg-muted/30 flex flex-col">
            <PanelSectionHeader
              title={PANEL_ITEMS.find((p) => p.id === activePanel)?.label ?? ""}
            />
            <div className="flex-1 overflow-y-auto">
              {activePanel === "properties" && (
                <PropertiesPanel
                  task={task}
                  canEdit={canEdit}
                  update={update}
                  projectStatuses={projectStatuses}
                  taskLabels={taskLabels}
                  members={members}
                  onCreateLabel={onCreateLabel}
                  focusField={propFocus.field}
                  focusTick={propFocus.tick}
                  childCount={childTasks.length}
                  subtaskCount={subtasks.length}
                />
              )}
              {activePanel === "attachments" && (
                <AttachmentsPanel
                  workspaceId={workspaceId}
                  boardId={boardId}
                  taskId={taskId}
                />
              )}
              {activePanel === "dependencies" && (
                <DependenciesPanel
                  workspaceId={workspaceId}
                  boardId={boardId}
                  taskId={taskId}
                />
              )}
              {activePanel === "layout" && (
                <LayoutPanel prefs={layoutPrefs} onChange={updateLayoutPrefs} />
              )}
            </div>
          </div>
        )}

        {/* ── Icon strip ────────────────────────────────────────── */}
        <IconStrip activePanel={activePanel} onSelect={handlePanelSelect} />
      </div>

      {confirmState && (
        <ConfirmModal
          title="Delete task?"
          message={confirmState.message}
          onConfirm={() => {
            confirmState.onConfirm();
            setConfirmState(null);
          }}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </Modal>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────
function PanelHeader({
  task,
  board,
  workspaceId,
  boardId,
  canEdit,
  canDelete,
  approvals,
  approvalDropdown,
  setApprovalDropdown,
  approvalBtnRef,
  members,
  requestApproval,
  deleteTask,
  taskId,
  onClose,
  toast,
  onDeleteConfirm,
  onClone,
  isCloning,
}) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0 bg-background/95 backdrop-blur-sm sticky top-0 z-10 gap-3">
      {/* ── Breadcrumb ──────────────────────────────────────────── */}
      <nav className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
        {/* Boards root */}
        <button
          onClick={() => navigate(workspaceUrl(workspaceId, "boards"))}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <LayoutGrid className="w-3 h-3" />
          <span>Boards</span>
        </button>

        {board && (
          <>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            {/* Board name + icon */}
            <button
              onClick={() =>
                navigate(workspaceUrl(workspaceId, `boards/${boardId}`))
              }
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors min-w-0 max-w-[160px] group"
            >
              <BoardTypeIcon
                board_type={board.board_type}
                size="xs"
                // variant="circular"
                className="flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
              />
              <span className="truncate">{board.name}</span>
            </button>
          </>
        )}

        {task.task_type && (
          <>
            <ChevronRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize flex-shrink-0">
              {task.task_type}
            </span>
          </>
        )}
      </nav>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Tooltip content={<TooltipLabel label="Copy link" id="task:copy-link" />}>
          <button
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              toast.success("Link copied");
            }}
            className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </Tooltip>

        {canEdit && (
          <Tooltip content={<TooltipLabel label="Duplicate task" id="task:clone" />}>
            <button
              onClick={onClone}
              disabled={isCloning}
              className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CopyPlus className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}

        {canEdit && (
          <div className="relative" ref={approvalBtnRef}>
            <Tooltip content={<TooltipLabel label="Request approval" id="task:open-approval" />}>
              <button
                onClick={() => setApprovalDropdown((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors active:scale-[0.97]",
                  approvals.some((a) => a.status === "pending")
                    ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25"
                    : "bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent",
                )}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {approvals.length > 0
                  ? `${approvals.filter((a) => a.status === "approved").length}/${approvals.length} approved`
                  : "Request approval"}
              </button>
            </Tooltip>
            {approvalDropdown && (
              <RequestApprovalDropdown
                members={members}
                requestApproval={requestApproval}
                onClose={() => setApprovalDropdown(false)}
                anchorRef={approvalBtnRef}
              />
            )}
          </div>
        )}

        {canDelete && (
          <Tooltip content={<TooltipLabel label="Delete task" id="task:delete" />}>
            <button
              onClick={() =>
                onDeleteConfirm({
                  message: "Delete this task? This cannot be undone.",
                  onConfirm: () =>
                    deleteTask.mutate(taskId, { onSuccess: onClose }),
                })
              }
              className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-[0.97]"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </Tooltip>
        )}

        <div className="w-px h-4 bg-border mx-0.5" />

        <Tooltip content={<TooltipLabel label="Close" id="board:close" />}>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function ConflictBanner({ conflict, onDismiss, onReload }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-2 bg-amber-500/10 border-b border-amber-500/25 flex-shrink-0">
      <span className="text-xs text-amber-700 font-medium">
        This task was saved {formatDistanceToNow(new Date(conflict.updated_at))}{" "}
        ago. Your version may differ.
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onDismiss}
          className="text-xs px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 font-medium transition-colors"
        >
          Dismiss
        </button>
        <button
          onClick={onReload}
          className="text-xs px-2.5 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600 font-medium transition-colors"
        >
          Reload latest
        </button>
      </div>
    </div>
  );
}
