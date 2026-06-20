import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Copy, CopyPlus, ShieldCheck, Trash2, ChevronRight } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { Loader } from "@/components/ui/Loader";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import Modal from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import VoltEditor from "@/components/ui/VoltEditor";
import { useMembers } from "@/hooks/useMembers";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";
import {
  useDeleteTask,
  useTasks,
  useTaskDetail,
  useTaskSubtasks,
  useUpdateTaskDetail,
  useCreateSubtask,
  useToggleSubtask,
  useDeleteSubtask,
} from "@/hooks/useTasks";
import {
  useChildTasks,
  useCreateChildTask,
  useAttachChildTask,
  useCloneTask,
} from "@/hooks/useTaskHierarchy";
import { useApprovals, useRequestApproval } from "@/hooks/useApprovals";
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
  CommentsPanel,
  ActivityPanel,
  AttachmentsPanel,
  DependenciesPanel,
  ApprovalsPanel,
  LayoutPanel,
  RequestApprovalDropdown,
} from "./TaskDetailPanels";

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
}) {
  const { workspaceId, boardId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: members = [] } = useMembers(workspaceId);
  const { data: task, isLoading } = useTaskDetail(workspaceId, boardId, taskId);
  const { data: subtasks = [] } = useTaskSubtasks(workspaceId, boardId, taskId);
  const { data: childTasks = [] } = useChildTasks(workspaceId, boardId, taskId);
  const { data: allTasks = [] } = useTasks(workspaceId, boardId);
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

  const handleClone = () => {
    cloneTask.mutate(taskId, {
      onSuccess: (data) => {
        toast.success("Task cloned");
        navigate(`?task=${data.id}`, { replace: true });
      },
    });
  };
  const qc = useQueryClient();

  const [layoutPrefs, setLayoutPrefs] = useState(getLayoutPrefs);
  const [activePanel, setActivePanel] = useState(() =>
    focusCommentId
      ? "comments"
      : (getLayoutPrefs().defaultPanel ?? "properties"),
  );
  const [approvalDropdown, setApprovalDropdown] = useState(false);
  const approvalBtnRef = useRef(null);
  const [conflict, setConflict] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const typingTimers = useRef({});
  const [confirmState, setConfirmState] = useState(null);

  const updateLayoutPrefs = (patch) => {
    const next = { ...layoutPrefs, ...patch };
    setLayoutPrefs(next);
    localStorage.setItem("jcn:task-panel-layout", JSON.stringify(next));
  };

  const handlePanelSelect = (id) =>
    setActivePanel((cur) => (cur === id ? null : id));

  useEffect(() => {
    const handler = (e) => {
      const { task_id, user_id, user_name, is_typing } = e.detail;
      if (task_id !== taskId || user_id === user?.id) return;
      setTypingUsers((prev) => {
        if (is_typing)
          return prev.some((u) => u.id === user_id)
            ? prev
            : [...prev, { id: user_id, name: user_name }];
        return prev.filter((u) => u.id !== user_id);
      });
      if (is_typing) {
        clearTimeout(typingTimers.current[user_id]);
        typingTimers.current[user_id] = setTimeout(
          () => setTypingUsers((prev) => prev.filter((u) => u.id !== user_id)),
          4000,
        );
      }
    };
    window.addEventListener("jcn:typing", handler);
    return () => window.removeEventListener("jcn:typing", handler);
  }, [taskId, user?.id]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (isLoading || !task) {
    return (
      <Modal
        isOpen={true}
        onClose={onClose}
        title="Task Detail"
        showFooter={false}
        padding="p-0"
        maxWidth="80rem"
      >
        {/* <div className="flex items-center justify-center min-h-[600px]"> */}
          <Loader />
        {/* </div> */}
      </Modal>
    );
  }

  const descSizeClass =
    DESC_SIZE_CLASSES[layoutPrefs.descriptionSize ?? "comfortable"];

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Task Detail"
      showFooter={false}
      padding="p-0"
      maxWidth="80rem"
    >
      <PanelHeader
        task={task}
        canEdit={canEdit}
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
        <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-4">
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
          />

          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Description
            </p>
            <VoltEditor
              value={task.description || ""}
              onBlur={(md) => {
                if (md !== task.description) update.mutate({ description: md });
              }}
              readOnly={!canEdit}
              placeholder="Add a description…"
              className={descSizeClass}
            />
          </div>

          {layoutPrefs.showWorkItems !== false && (
            <>
              <ChildTasksSection
                childTasks={childTasks}
                task={task}
                canEdit={canEdit}
                taskId={taskId}
                allTasks={allTasks}
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
        </div>

        {/* ── Side panel — only mounted when a panel is active ──── */}
        {activePanel && (
          <div className="w-72 flex-shrink-0 border-l border-border overflow-y-auto bg-muted/10 flex flex-col">
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
                />
              )}
              {activePanel === "comments" && (
                <CommentsPanel
                  workspaceId={workspaceId}
                  boardId={boardId}
                  taskId={taskId}
                  user={user}
                  members={members}
                  typingUsers={typingUsers}
                  focusCommentId={focusCommentId}
                />
              )}
              {activePanel === "activity" && (
                <ActivityPanel
                  workspaceId={workspaceId}
                  boardId={boardId}
                  taskId={taskId}
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
              {activePanel === "approvals" && (
                <ApprovalsPanel
                  approvals={approvals}
                  user={user}
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
        <IconStrip
          activePanel={activePanel}
          onSelect={handlePanelSelect}
          commentCount={task.comment_count}
          approvalCount={approvals.length}
          approvalPending={approvals.some((a) => a.status === "pending")}
        />
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
  canEdit,
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
  return (
    <div className="flex items-center justify-between px-5 py-2 border-b flex-shrink-0">
      {task.task_type && (
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">
          {task.task_type}
        </span>
      )}

      <div className="flex items-center gap-1">
        <Tooltip content="Copy link">
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
          <Tooltip content="Duplicate task">
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
            <Tooltip content="Request approval">
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

        {canEdit && (
          <Tooltip content="Delete task">
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
