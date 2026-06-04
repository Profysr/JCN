import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  X,
  Flag,
  Calendar,
  User,
  CheckSquare,
  MessageSquare,
  Zap,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Check,
  Activity,
  Tag,
  Layers,
  Copy,
  GitBranch,
  Timer,
  Square,
  Clock,
  ShieldCheck,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { useDeleteTask } from "@/hooks/useTasks";
import { useToast } from "@/components/ui/toast";
import {
  PRIORITIES,
  getPriority,
  LABEL_COLORS as LABEL_COLOR_PALETTE,
  TASK_TYPES,
} from "@/lib/constants";
import {
  useTaskDetail,
  useUpdateTaskDetail,
  useCreateComment,
  useDeleteComment,
  useCreateSubtask,
  useToggleSubtask,
  useDeleteSubtask,
} from "@/hooks/useTaskDetail";
import { useUpsertFieldValue } from "@/hooks/useCustomFields";
import { useMembers } from "@/hooks/useMembers";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MentionTextarea from "@/components/tasks/MentionTextarea";
import TaskAttachmentsSection from "@/components/tasks/TaskAttachmentsSection";
import TaskDependenciesSection from "@/components/tasks/TaskDependenciesSection";
import VoltEditor from "@/components/ui/VoltEditor";
import {
  useChildTasks,
  useCreateChildTask,
  useCloneTask,
} from "@/hooks/useTaskHierarchy";
import {
  useTimeEntries,
  useAddTimeEntry,
  useDeleteTimeEntry,
  useStartTimer,
  useStopTimer,
  useActiveTimer,
  formatDuration,
} from "@/hooks/useTimeTracking";
import { useAnnouncePresence, usePresence } from "@/hooks/usePresence";
import { useToggleReaction } from "@/hooks/useCommentReactions";
import { useApprovals, useRequestApproval, useSubmitReview, useResubmitApproval } from "@/hooks/useApprovals";

// Local alias so existing code below keeps working without changes
const LABEL_COLORS = LABEL_COLOR_PALETTE;
const PRIORITY_OPTIONS = PRIORITIES.map((p) => ({
  value: p.value,
  label: p.label,
  color: p.textCls,
  icon: p.icon,
}));

export default function TaskDetailPanel({
  taskId,
  projectStatuses = [],
  projectLabels = [],
  projectFields = [],
  onCreateLabel,
  onClose,
  canEdit = true,
}) {
  const { workspaceSlug, projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: members = [] } = useMembers(workspaceSlug);
  const { data: task, isLoading } = useTaskDetail(
    workspaceSlug,
    projectId,
    taskId,
  );
  const { data: childTasks = [] } = useChildTasks(
    workspaceSlug,
    projectId,
    taskId,
  );
  const update = useUpdateTaskDetail(workspaceSlug, projectId, taskId);
  const upsertField = useUpsertFieldValue(workspaceSlug, projectId, taskId);
  const createComment = useCreateComment(workspaceSlug, projectId, taskId);
  const deleteComment = useDeleteComment(workspaceSlug, projectId, taskId);
  const createSubtask = useCreateSubtask(workspaceSlug, projectId, taskId);
  const toggleSubtask = useToggleSubtask(workspaceSlug, projectId, taskId);
  const deleteSubtask = useDeleteSubtask(workspaceSlug, projectId, taskId);
  const deleteTask = useDeleteTask(workspaceSlug, projectId);
  const createChild = useCreateChildTask(workspaceSlug, projectId, taskId);
  const cloneTask = useCloneTask(workspaceSlug, projectId);
  const { toast } = useToast();

  // v2.8.0 — time tracking
  const { data: timeEntries = [] } = useTimeEntries(
    workspaceSlug,
    projectId,
    taskId,
  );
  const { data: activeTimer } = useActiveTimer(workspaceSlug);
  const startTimer = useStartTimer(workspaceSlug, projectId, taskId);
  const stopTimer = useStopTimer(workspaceSlug);
  const addEntry = useAddTimeEntry(workspaceSlug, projectId, taskId);
  const deleteEntry = useDeleteTimeEntry(workspaceSlug, projectId, taskId);

  const isTimerRunningOnThisTask = activeTimer?.task === taskId;
  const totalLogged = timeEntries.reduce(
    (s, e) => s + (e.duration_seconds || 0),
    0,
  );

  // v3.6.0 — approvals
  const { data: approvals = [] } = useApprovals(workspaceSlug, projectId, taskId);
  const requestApproval = useRequestApproval(workspaceSlug, projectId, taskId);
  const [approvalDropdown, setApprovalDropdown] = useState(false);
  const approvalBtnRef = useRef(null);

  // v3.5.0 — presence + conflict
  useAnnouncePresence(workspaceSlug, "task", taskId);
  const { data: taskViewers = [] } = usePresence(workspaceSlug, "task", taskId);
  const otherViewers = taskViewers.filter((v) => v.user?.id !== user?.id);
  const toggleReaction = useToggleReaction(workspaceSlug, projectId, taskId);

  const [conflict, setConflict] = useState(null); // { current_version, updated_at }
  const [typingUsers, setTypingUsers] = useState([]); // [{id, name}]
  const typingTimers = useRef({});
  const [emojiPickerFor, setEmojiPickerFor] = useState(null); // commentId | null

  const QUICK_EMOJIS = ["👍", "❤️", "😄", "🎉", "🚀", "👀"];

  const [commentBody, setCommentBody] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newChildTitle, setNewChildTitle] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [childrenOpen, setChildrenOpen] = useState(true);
  const [manualLogOpen, setManualLogOpen] = useState(false);
  const [manualMinutes, setManualMinutes] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [activityTab, setActivityTab] = useState("comments"); // "comments" | "activity"
  const [commentFocused, setCommentFocused] = useState(false);
  const titleRef = useRef(null);
  const typingPingRef = useRef(0); // timestamp of last presence ping

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);

  // Listen for typing events from other users on this task
  useEffect(() => {
    const handler = (e) => {
      const { task_id, user_id, user_name, is_typing } = e.detail;
      if (task_id !== taskId || user_id === user?.id) return;
      setTypingUsers((prev) => {
        if (is_typing) {
          return prev.some((u) => u.id === user_id)
            ? prev
            : [...prev, { id: user_id, name: user_name }];
        }
        return prev.filter((u) => u.id !== user_id);
      });
      // Auto-clear after 4s in case "stop" event is missed
      if (is_typing) {
        clearTimeout(typingTimers.current[user_id]);
        typingTimers.current[user_id] = setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u.id !== user_id));
        }, 4000);
      }
    };
    window.addEventListener("jcn:typing", handler);
    return () => window.removeEventListener("jcn:typing", handler);
  }, [taskId, user?.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (isLoading || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div
          className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl flex items-center justify-center"
          style={{ height: "60vh" }}
        >
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  // const priority =
  //   PRIORITY_OPTIONS.find((p) => p.value === task.priority) ||
  //   PRIORITY_OPTIONS[0];

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== task.title)
      update.mutate(
        { title: titleDraft.trim(), version: task.version },
        {
          onError: (err) => {
            if (err?.response?.status === 409)
              setConflict(err.response.data);
          },
        },
      );
    setEditingTitle(false);
  };

  const handleCommentSubmit = (e) => {
    e?.preventDefault();
    if (!commentBody.trim()) return;
    createComment.mutate(commentBody.trim(), {
      onSuccess: () => { setCommentBody(""); setCommentFocused(false); },
    });
  };

  const handleSubtaskAdd = (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    createSubtask.mutate(newSubtask.trim(), {
      onSuccess: () => setNewSubtask(""),
    });
  };

  const handleChildAdd = (e) => {
    e.preventDefault();
    if (!newChildTitle.trim()) return;
    const defaultStatus = projectStatuses[0];
    createChild.mutate(
      { title: newChildTitle.trim(), status_id: defaultStatus?.id },
      { onSuccess: () => setNewChildTitle("") },
    );
  };

  const handleClone = () => {
    cloneTask.mutate(taskId, {
      onSuccess: (cloned) => toast.success(`Cloned as "${cloned.title}"`),
    });
  };

  const openParent = (parentId) => {
    navigate(`?task=${parentId}`, { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-6xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-scale-in"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0 bg-card">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Task Detail
            </span>
            {task.task_type && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary capitalize">
                {task.task_type}
              </span>
            )}
          </div>
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
              <Tooltip content="Clone task">
                <button
                  onClick={handleClone}
                  className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
                >
                  <GitBranch className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}

            {/* v3.6.0 — request approval dropdown */}
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

            {/* Timer button */}
            <Tooltip
              content={isTimerRunningOnThisTask ? "Stop timer" : "Start timer"}
            >
              <button
                onClick={() =>
                  isTimerRunningOnThisTask
                    ? stopTimer.mutate()
                    : startTimer.mutate()
                }
                className={cn(
                  "p-1.5 rounded-md transition-colors active:scale-[0.97]",
                  isTimerRunningOnThisTask
                    ? "bg-red-500/15 text-red-500 hover:bg-red-500/25"
                    : "bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent",
                )}
              >
                {isTimerRunningOnThisTask ? (
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Timer className="w-3.5 h-3.5" />
                )}
              </button>
            </Tooltip>

            {canEdit && (
              <Tooltip content="Delete task">
                <button
                  onClick={() => {
                    if (
                      window.confirm("Delete this task? This cannot be undone.")
                    ) {
                      deleteTask.mutate(taskId, { onSuccess: onClose });
                    }
                  }}
                  className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-[0.97]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </Tooltip>
            )}

            <Tooltip content="Close panel">
              <button
                onClick={onClose}
                className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-foreground hover:bg-accent transition-colors active:scale-[0.97]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>

        {/* v3.5.0 — editing banner: show other active viewers */}
        {otherViewers.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-1.5 bg-blue-500/8 border-b border-blue-500/20 flex-shrink-0">
            <div className="flex -space-x-1">
              {otherViewers.slice(0, 3).map((v) => (
                <Avatar
                  key={v.user.id}
                  name={v.user.display_name || v.user.full_name || v.user.email}
                  src={v.user.avatar}
                  size="xs"
                  className="ring-1 ring-background"
                />
              ))}
            </div>
            <span className="text-xs text-blue-600">
              {otherViewers.length === 1
                ? `${otherViewers[0].user.full_name || otherViewers[0].user.email} is viewing this task`
                : `${otherViewers.length} people are viewing this task`}
            </span>
          </div>
        )}

        {/* v3.5.0 — conflict banner */}
        {conflict && (
          <div className="flex items-center justify-between gap-3 px-5 py-2 bg-amber-500/10 border-b border-amber-500/25 flex-shrink-0">
            <span className="text-xs text-amber-700 font-medium">
              This task was saved {formatDistanceToNow(new Date(conflict.updated_at))} ago. Your version may differ.
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setConflict(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 font-medium transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => { setConflict(null); window.location.reload(); }}
                className="text-xs px-2.5 py-1 rounded-md bg-amber-500 text-white hover:bg-amber-600 font-medium transition-colors"
              >
                Reload latest
              </button>
            </div>
          </div>
        )}

        {/* ── Two-column body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* LEFT COLUMN — main content */}
          <div className="flex-1 min-w-0 overflow-y-auto px-6 py-5 space-y-6 border-r border-border">
            {/* Breadcrumb */}
            {task.ancestors?.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {task.ancestors.map((a, i) => (
                  <span key={a.id} className="flex items-center gap-1">
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                    <button
                      onClick={() => openParent(a.id)}
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

            {/* Title */}
            {editingTitle && canEdit ? (
              <textarea
                ref={titleRef}
                rows={2}
                className="w-full text-xl font-bold resize-none bg-transparent border-b-2 border-primary outline-none pb-1 leading-snug"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleTitleSave();
                  }
                }}
              />
            ) : (
              <h2
                onClick={() =>
                  canEdit && (setTitleDraft(task.title), setEditingTitle(true))
                }
                className={cn(
                  "text-xl font-bold leading-snug rounded px-1 -mx-1 py-0.5",
                  canEdit && "cursor-text hover:bg-accent/40",
                )}
              >
                {task.title}
              </h2>
            )}

            {/* Description */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Description
              </p>
              <VoltEditor
                value={task.description || ""}
                onBlur={(md) => {
                  if (md !== task.description)
                    update.mutate({ description: md });
                }}
                readOnly={!canEdit}
                placeholder="Add a description…"
              />
            </div>

            {/* Child Tasks */}
            <div>
              <button
                onClick={() => setChildrenOpen((o) => !o)}
                className="flex items-center gap-1.5 mb-2 w-full"
              >
                {childrenOpen ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Child Tasks{" "}
                  {childTasks.length > 0 && (
                    <span className="ml-1 font-normal normal-case">
                      ({task.done_child_count}/{childTasks.length})
                    </span>
                  )}
                </p>
              </button>
              {childrenOpen && (
                <div className="space-y-1.5 ml-1">
                  {childTasks.map((child) => (
                    <div
                      key={child.id}
                      className="flex items-center gap-2 group"
                    >
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{
                          backgroundColor:
                            child.status_detail?.color || "#94a3b8",
                        }}
                      />
                      <button
                        onClick={() =>
                          navigate(`?task=${child.id}`, { replace: true })
                        }
                        className="text-sm flex-1 text-left hover:text-primary transition-colors truncate"
                      >
                        {child.title}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {child.status_detail?.name}
                      </span>
                    </div>
                  ))}
                  {canEdit && (
                    <form onSubmit={handleChildAdd} className="flex gap-2 mt-1">
                      <input
                        className="flex-1 text-sm border-b border-border bg-transparent outline-none py-0.5 placeholder:text-muted-foreground focus:border-primary"
                        placeholder="Add child task…"
                        value={newChildTitle}
                        onChange={(e) => setNewChildTitle(e.target.value)}
                      />
                      {newChildTitle && (
                        <button
                          type="submit"
                          className="text-primary text-xs font-medium"
                        >
                          Add
                        </button>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Checklist */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Checklist{" "}
                  {task.subtasks?.length > 0 && (
                    <span className="ml-1 font-normal normal-case">
                      ({task.done_subtask_count}/{task.subtask_count})
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-1.5 mb-2">
                {task.subtasks?.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() =>
                        canEdit &&
                        toggleSubtask.mutate({
                          subtaskId: sub.id,
                          is_done: !sub.is_done,
                        })
                      }
                      disabled={!canEdit}
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                        sub.is_done
                          ? "bg-primary border-primary"
                          : "border-border",
                        canEdit && "hover:border-primary",
                      )}
                    >
                      {sub.is_done && (
                        <Check className="w-2.5 h-2.5 text-white" />
                      )}
                    </button>
                    <span
                      className={cn(
                        "text-sm flex-1",
                        sub.is_done && "line-through text-muted-foreground",
                      )}
                    >
                      {sub.title}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => deleteSubtask.mutate(sub.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <form onSubmit={handleSubtaskAdd} className="flex gap-2">
                  <input
                    className="flex-1 text-sm border-b border-border bg-transparent outline-none py-0.5 placeholder:text-muted-foreground focus:border-primary"
                    placeholder="Add checklist item…"
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                  />
                  {newSubtask && (
                    <button
                      type="submit"
                      className="text-primary text-xs font-medium"
                    >
                      Add
                    </button>
                  )}
                </form>
              )}
            </div>

            {/* Attachments */}
            <TaskAttachmentsSection
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              taskId={taskId}
            />

            {/* Dependencies */}
            <TaskDependenciesSection
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              taskId={taskId}
            />



            {/* ── Comments + Activity tabs + Time Log ── */}
            <div>
              {/* Tab bar */}
              <div className="flex items-center gap-0 border-b border-border mb-4">
                {[
                  {
                    id: "comments",
                    icon: MessageSquare,
                    label: "Comments",
                    count: task.comments?.length,
                  },
                  {
                    id: "activity",
                    icon: Activity,
                    label: "Activity",
                    count: task.activities?.length,
                  },
                  {
                    id: "timelog",
                    icon: Clock,
                    label: "Time Log",
                    count: totalLogged > 0 ? formatDuration(totalLogged) : null,
                  },
                  {
                    id: "approvals",
                    icon: ShieldCheck,
                    label: "Approvals",
                    count: approvals.length || null,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActivityTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 -mb-px transition-colors",
                      activityTab === tab.id
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                          activityTab === tab.id
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Comments tab */}
              {activityTab === "comments" && (
                <div>
                  {/* Comment input */}
                  <form onSubmit={handleCommentSubmit} className="flex gap-2.5 items-start mb-3">
                    <Avatar
                      name={user?.display_name || user?.email || "?"}
                      size="sm"
                      className="flex-shrink-0 mt-1.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "rounded-xl border transition-all",
                          commentFocused
                            ? "border-primary ring-2 ring-primary/15"
                            : "border-border",
                        )}
                      >
                        <MentionTextarea
                          value={commentBody}
                          onChange={(val) => {
                            setCommentBody(val);
                            const now = Date.now();
                            if (now - typingPingRef.current > 3000) {
                              typingPingRef.current = now;
                              import("@/lib/api").then(({ default: api }) => {
                                api.post(`/api/workspaces/${workspaceSlug}/presence/`, {
                                  resource_type: "task",
                                  resource_id: taskId,
                                }).catch(() => {});
                              });
                            }
                          }}
                          onFocus={() => setCommentFocused(true)}
                          onSubmit={handleCommentSubmit}
                          members={members}
                        />
                        {commentFocused && (
                          <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
                            <button
                              type="button"
                              onClick={() => { setCommentBody(""); setCommentFocused(false); }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
                            >
                              Cancel
                            </button>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={!commentBody.trim() || createComment.isPending}
                            >
                              {createComment.isPending ? "Sending…" : "Send"}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </form>

                  {/* Typing indicators */}
                  {typingUsers.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-4 pl-10 flex items-center gap-1">
                      <span className="inline-flex gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                        <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                      </span>
                      {typingUsers.map((u) => u.name).join(", ")}{" "}
                      {typingUsers.length === 1 ? "is" : "are"} typing…
                    </p>
                  )}

                  {/* Comment list */}
                  {task.comments?.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No comments yet. Be the first to comment.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {task.comments?.map((c) => (
                        <div key={c.id} className="flex gap-3 group">
                          <Avatar
                            name={
                              c.author?.display_name ||
                              c.author?.full_name ||
                              c.author?.email
                            }
                            size="sm"
                            className="flex-shrink-0 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold">
                                {c.author?.full_name || c.author?.email}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(
                                  new Date(c.created_at),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            </div>
                            <div className="bg-muted/40 rounded-lg px-3 py-2">
                              <p className="text-sm break-words">{c.body}</p>
                            </div>

                            {/* Reactions row */}
                            <div className="flex items-center flex-wrap gap-1 mt-1.5 relative">
                              {Object.entries(c.reactions || {}).map(([emoji, users]) => (
                                <button
                                  key={emoji}
                                  onClick={() => toggleReaction.mutate({ commentId: c.id, emoji })}
                                  className={cn(
                                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors",
                                    users.some((u) => u.user_id === user?.id)
                                      ? "bg-primary/10 border-primary/30 text-primary"
                                      : "bg-muted/60 border-border hover:bg-muted",
                                  )}
                                  title={users.map((u) => u.name).join(", ")}
                                >
                                  {emoji} <span>{users.length}</span>
                                </button>
                              ))}

                              {/* Add reaction button */}
                              <div className="relative">
                                <button
                                  onClick={() => setEmojiPickerFor(emojiPickerFor === c.id ? null : c.id)}
                                  className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs text-muted-foreground hover:bg-muted border border-dashed border-border transition-all"
                                  title="Add reaction"
                                >
                                  +
                                </button>
                                {emojiPickerFor === c.id && (
                                  <>
                                    <div className="fixed inset-0 z-40" onClick={() => setEmojiPickerFor(null)} />
                                    <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 bg-popover border border-border rounded-xl shadow-popover px-2 py-1.5">
                                      {QUICK_EMOJIS.map((e) => (
                                        <button
                                          key={e}
                                          onClick={() => {
                                            toggleReaction.mutate({ commentId: c.id, emoji: e });
                                            setEmojiPickerFor(null);
                                          }}
                                          className="text-lg hover:scale-125 transition-transform"
                                        >
                                          {e}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          {c.author?.email === user?.email && (
                            <button
                              onClick={() => deleteComment.mutate(c.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0 mt-1 transition-opacity"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Activity tab */}
              {activityTab === "activity" && (
                <div>
                  {!task.activities?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No activity yet.
                    </p>
                  ) : (
                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
                      <div className="space-y-3">
                        {task.activities.map((a) => (
                          <div
                            key={a.id}
                            className="flex items-start gap-3 relative"
                          >
                            <Avatar
                              name={
                                a.actor?.display_name ||
                                a.actor?.full_name ||
                                a.actor?.email ||
                                "?"
                              }
                              size="xs"
                              className="flex-shrink-0 mt-0.5 z-10 ring-2 ring-card"
                            />
                            <div className="flex-1 min-w-0 bg-muted/30 rounded-lg px-3 py-2">
                              <span className="text-xs">
                                <span className="font-semibold text-foreground">
                                  {a.actor?.full_name || "Someone"}
                                </span>{" "}
                                {a.verb.replace(/_/g, " ")}
                                {a.meta?.from && (
                                  <>
                                    {" "}
                                    from{" "}
                                    <span className="font-semibold text-foreground">
                                      {a.meta.from}
                                    </span>
                                  </>
                                )}
                                {a.meta?.to && (
                                  <>
                                    {" "}
                                    to{" "}
                                    <span className="font-semibold text-foreground">
                                      {a.meta.to}
                                    </span>
                                  </>
                                )}
                              </span>
                              <span className="text-[10px] text-muted-foreground ml-2">
                                {format(
                                  new Date(a.created_at),
                                  "MMM d, h:mm a",
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Time Log tab ── */}
              {activityTab === "timelog" && (
                <div className="space-y-4">
                  {/* Active Timer Banner */}
                  {isTimerRunningOnThisTask && (
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 mb-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                      <span className="text-xs text-red-600 font-medium">
                        Timer running
                      </span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        started{" "}
                        {formatDistanceToNow(new Date(activeTimer.start_at), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  )}

                  {/* Manual Input Dropdown */}
                  {manualLogOpen && canEdit && (
                    <div className="rounded-lg border px-3 py-2.5 mb-2 space-y-2">
                      <div className="grid grid-cols-4 gap-2">
                        {[15, 30, 60, 120].map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => setManualMinutes(String(min))}
                            className={cn(
                              "text-xs px-2 py-1.5 rounded border transition-colors",
                              manualMinutes === String(min)
                                ? "bg-primary/15 border-primary/30 text-primary font-medium"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {min < 60 ? `${min}m` : `${min / 60}h`}
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        min="1"
                        placeholder="Or enter minutes…"
                        className="w-full text-xs border rounded px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
                        value={manualMinutes}
                        onChange={(e) => setManualMinutes(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Description (optional)"
                        className="w-full text-xs border rounded px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
                        value={manualDesc}
                        onChange={(e) => setManualDesc(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 text-xs h-7"
                          disabled={!manualMinutes || addEntry.isPending}
                          onClick={() =>
                            addEntry.mutate(
                              {
                                duration_seconds: parseInt(manualMinutes) * 60,
                                description: manualDesc,
                              },
                              {
                                onSuccess: () => {
                                  setManualLogOpen(false);
                                  setManualMinutes("");
                                  setManualDesc("");
                                },
                              },
                            )
                          }
                        >
                          {addEntry.isPending ? "Saving…" : "Log"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setManualLogOpen(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Time entries historical feed */}
                  {timeEntries.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No time logged on this task yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {timeEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center gap-2 group text-xs"
                        >
                          <Avatar
                            name={entry.user?.full_name || entry.user?.email}
                            size="xs"
                            className="flex-shrink-0"
                          />
                          <span className="font-medium text-foreground">
                            {formatDuration(entry.duration_seconds)}
                          </span>
                          {entry.description && (
                            <span className="text-muted-foreground truncate flex-1">
                              {entry.description}
                            </span>
                          )}
                          <span className="text-muted-foreground ml-auto flex-shrink-0">
                            {format(new Date(entry.created_at), "MMM d")}
                          </span>
                          {canEdit && (
                            <button
                              onClick={() => deleteEntry.mutate(entry.id)}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity ml-2"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Approvals tab */}
              {activityTab === "approvals" && (
                <div className="space-y-3">
                  {approvals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
                      <ShieldCheck className="w-8 h-8 opacity-30" />
                      <p className="text-sm font-medium">No approvals yet</p>
                      <p className="text-xs">Use the approval button in the header to request one.</p>
                    </div>
                  ) : (
                    approvals.map((approval) => (
                      <ApprovalCard
                        key={approval.id}
                        approval={approval}
                        currentUserId={user?.id}
                        workspaceSlug={workspaceSlug}
                        projectId={projectId}
                        taskId={taskId}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN — details sidebar (Jira style) */}
          <div className="w-72 flex-shrink-0 overflow-y-auto px-4 py-5 space-y-1 bg-muted/20">
            {/* Status — prominent animated dropdown */}
            {/* <div className="mb-5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">
                Status
              </p> */}
            <DetailRow label="Status">
              <Dropdown
                // fullWidth
                disabled={!canEdit}
                value={task.status_detail?.id || ""}
                options={projectStatuses.map((s) => ({
                  value: s.id,
                  label: s.name,
                  color: s.color,
                }))}
                onChange={(v) => update.mutate({ status_id: v })}
                renderTrigger={(opt) =>
                  opt ? (
                    <span
                      className="flex items-center gap-2 font-semibold"
                      style={{ color: opt.color }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: opt.color }}
                      />
                      {opt.label}
                    </span>
                  ) : null
                }
                renderOption={(opt) => (
                  <span
                    className="flex items-center gap-2"
                    style={{ color: opt.color }}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </span>
                )}
              />
              {/* </div> */}
            </DetailRow>

            {/* Detail rows — animated dropdowns */}
            <DetailRow label="Priority">
              <Dropdown
                disabled={!canEdit}
                value={task.priority}
                options={PRIORITY_OPTIONS.map((p) => ({ ...p }))}
                onChange={(v) => update.mutate({ priority: v })}
                // renderTrigger={(opt) =>
                //   opt && (
                //     <span className={cn("text-sm", opt.color)}>
                //       {opt.label}
                //     </span>
                //   )
                // }
                // renderOption={(opt) => (
                //   <span className={cn("text-sm", opt.color)}>{opt.label}</span>
                // )}
                renderTrigger={(opt) => {
                  if (!opt) return null;
                  const Icon = opt.icon; // Capitalize so React knows it's a component
                  return (
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm",
                        opt.color,
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                      {opt.label}
                    </span>
                  );
                }}
                renderOption={(opt) => {
                  const Icon = opt.icon;
                  return (
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm",
                        // opt.color,
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                      {opt.label}
                    </span>
                  );
                }}
              />
            </DetailRow>

            <DetailRow label="Type">
              <Dropdown
                disabled={!canEdit}
                value={task.task_type || "task"}
                options={TASK_TYPES.map((t) => ({
                  ...t,
                }))}
                onChange={(v) => update.mutate({ task_type: v })}
                renderTrigger={(opt) => {
                  if (!opt) return null;
                  const Icon = opt.icon; // Capitalize so React knows it's a component
                  return (
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm",
                        opt.color,
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                      {opt.label}
                    </span>
                  );
                }}
                renderOption={(opt) => {
                  const Icon = opt.icon;
                  return (
                    <span
                      className={cn(
                        "flex items-center gap-1.5 text-sm",
                        // opt.color,
                      )}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                      {opt.label}
                    </span>
                  );
                }}
              />
            </DetailRow>

            <DetailRow label="Assignee">
              <Dropdown
                disabled={!canEdit}
                value={task.assignee?.id || ""}
                placeholder="Unassigned"
                options={[
                  { value: "", label: "Unassigned" },
                  ...members.map((m) => ({
                    value: m.user?.id,
                    label: m.user?.full_name || m.user?.email,
                  })),
                ]}
                onChange={(v) => update.mutate({ assignee_id: v || null })}
                renderTrigger={(opt) =>
                  opt && (
                    <span className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {opt.label[0]?.toUpperCase()}
                      </div>
                      <span className="text-sm truncate">{opt.label}</span>
                    </span>
                  )
                }
                renderOption={(opt) => (
                  <span className="flex items-center gap-2">
                    {opt.value ? (
                      <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {opt.label[0]?.toUpperCase()}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                        <User className="w-3 h-3 text-muted-foreground" />
                      </div>
                    )}
                    <span>{opt.label}</span>
                  </span>
                )}
              />
            </DetailRow>

            <DetailRow label="Start Date">
              <input
                type="date"
                className="w-full bg-transparent text-sm outline-none cursor-pointer disabled:opacity-70"
                value={task.start_date || ""}
                onChange={(e) =>
                  update.mutate({ start_date: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </DetailRow>

            <DetailRow label="Due Date">
              <input
                type="date"
                className="w-full bg-transparent text-sm outline-none cursor-pointer disabled:opacity-70"
                value={task.due_date || ""}
                onChange={(e) =>
                  update.mutate({ due_date: e.target.value || null })
                }
                disabled={!canEdit}
              />
            </DetailRow>

            <DetailRow label="Story Points">
              <input
                type="number"
                min="0"
                placeholder="—"
                className="w-full bg-transparent text-sm outline-none disabled:opacity-70"
                value={task.estimate_points ?? ""}
                onChange={(e) =>
                  update.mutate({
                    estimate_points:
                      e.target.value === "" ? null : parseInt(e.target.value),
                  })
                }
                disabled={!canEdit}
              />
            </DetailRow>

            <DetailRow label="Est. Hours">
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="—"
                className="w-full bg-transparent text-sm outline-none disabled:opacity-70"
                value={task.estimate_hours ?? ""}
                onChange={(e) =>
                  update.mutate({
                    estimate_hours:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                disabled={!canEdit}
              />
            </DetailRow>

            {/* Labels */}
            <div className="pt-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Labels
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                {task.labels?.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => {
                      const newIds = (task.labels || [])
                        .filter((x) => x.id !== l.id)
                        .map((x) => x.id);
                      update.mutate({ label_ids: newIds });
                    }}
                    className="group flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: l.color + "22", color: l.color }}
                    title="Click to remove"
                  >
                    {l.name}
                    <X className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
                {canEdit && (
                  <LabelPicker
                    currentLabels={task.labels || []}
                    projectLabels={projectLabels}
                    onToggle={(label) => {
                      const ids = (task.labels || []).map((l) => l.id);
                      update.mutate({
                        label_ids: ids.includes(label.id)
                          ? ids.filter((id) => id !== label.id)
                          : [...ids, label.id],
                      });
                    }}
                    onCreateLabel={onCreateLabel}
                  />
                )}
              </div>
            </div>

            {/* v3.8.0 — Contributes to key results */}
            {task.key_result_links?.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Contributes to
                </p>
                <div className="flex flex-col gap-1">
                  {task.key_result_links.map((kr) => (
                    <span
                      key={kr.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/8 text-primary text-xs font-medium"
                      title={kr.objective_title}
                    >
                      <span className="text-[10px]">🎯</span>
                      <span className="truncate">{kr.title}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Fields */}
            {projectFields.length > 0 && (
              <div className="pt-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Custom Fields
                </p>
                <div className="space-y-1">
                  {projectFields.map((field) => {
                    const fv = task.field_values?.find(
                      (v) => v.field.id === field.id,
                    );
                    const val = fv?.value ?? "";
                    return (
                      <DetailRow key={field.id} label={field.name}>
                        <CustomFieldInput
                          field={field}
                          value={val}
                          onSave={(newVal) => {
                            if (newVal !== val)
                              upsertField.mutate({
                                field_id: field.id,
                                value: newVal,
                              });
                          }}
                        />
                      </DetailRow>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomFieldInput({ field, value, onSave }) {
  const [draft, setDraft] = useState(value);
  const commit = () => onSave(draft);

  if (field.type === "select") {
    return (
      <select
        className="w-full bg-transparent text-sm outline-none"
        value={value}
        onChange={(e) => onSave(e.target.value)}
      >
        <option value="">— none —</option>
        {(field.options || []).map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type={
        field.type === "number"
          ? "number"
          : field.type === "date"
            ? "date"
            : field.type === "url"
              ? "url"
              : "text"
      }
      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      placeholder={`Enter ${field.name.toLowerCase()}…`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}

function LabelPicker({
  currentLabels,
  projectLabels,
  onToggle,
  onCreateLabel,
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentIds = new Set(currentLabels.map((l) => l.id));

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateLabel?.(
      { name: newName.trim(), color: newColor },
      { onSuccess: () => setNewName("") },
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground border border-dashed rounded px-2 py-0.5 hover:text-foreground hover:border-foreground/50 transition-colors"
      >
        <Plus className="w-3 h-3" /> Add label
      </button>

      {open && (
        <div className="absolute left-0 top-7 z-50 w-56 bg-popover border rounded-xl shadow-popover p-2">
          {projectLabels.length > 0 && (
            <>
              <div className="space-y-0.5 mb-2">
                {projectLabels.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => onToggle(l)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-sm transition-colors"
                  >
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: l.color }}
                    />
                    <span className="flex-1 text-left">{l.name}</span>
                    {currentIds.has(l.id) && (
                      <Check className="w-3.5 h-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t mb-2" />
            </>
          )}
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              className="w-full text-xs border rounded px-2 py-1.5 bg-background outline-none focus:ring-1 focus:ring-ring"
              placeholder="New label name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
            <div className="flex gap-1.5 flex-wrap">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "w-5 h-5 rounded-full transition-transform",
                    newColor === c &&
                      "ring-2 ring-offset-1 ring-ring scale-110",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {newName.trim() && (
              <button
                type="submit"
                className="w-full text-xs bg-primary text-primary-foreground rounded py-1.5 font-medium hover:bg-primary/90 transition-colors"
              >
                Create "{newName.trim()}"
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

// ── Animated custom dropdown ───────────────────────────────────────────────────
function Dropdown({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  renderTrigger,
  renderOption,
  fullWidth = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", fullWidth && "w-full")} ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center justify-between gap-2 text-sm transition-colors rounded-lg",
          fullWidth
            ? "w-full px-3 py-2 border border-border hover:border-primary/50 bg-card"
            : "w-full text-left",
          disabled && "cursor-not-allowed opacity-60",
          !disabled && "cursor-pointer",
        )}
      >
        <span className="flex-1 truncate">
          {renderTrigger
            ? renderTrigger(selected)
            : selected?.label || (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Animated panel */}
      <div
        className={cn(
          "absolute left-0 right-0 z-[60] bg-popover border border-border rounded-xl shadow-xl overflow-hidden transition-all duration-200 origin-top",
          open
            ? "opacity-100 scale-y-100 translate-y-0.5"
            : "opacity-0 scale-y-95 -translate-y-1 pointer-events-none",
        )}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              onChange(opt.value);
              setOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
              opt.value === value && "bg-accent/70 font-semibold",
            )}
          >
            {renderOption ? renderOption(opt) : opt.label}
            {opt.value === value && (
              <Check className="w-3.5 h-3.5 ml-auto text-primary flex-shrink-0" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Jira-style horizontal detail row used in the right sidebar
function DetailRow({ label, children }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0 group hover:bg-accent/20 -mx-2 px-2 rounded transition-colors">
      <span className="text-xs font-medium text-muted-foreground w-24 flex-shrink-0">
        {label}
      </span>
      <div className="flex-1 min-w-0 text-sm">{children}</div>
    </div>
  );
}

function MetaField({ label, icon, children }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        {children}
      </div>
    </div>
  );
}

// ── v3.6.0 — Approval helpers ─────────────────────────────────────────────────

const REVIEWER_STATUS_CONFIG = {
  pending:           { label: "Pending",          cls: "bg-muted text-muted-foreground" },
  approved:          { label: "Approved",          cls: "bg-emerald-500/10 text-emerald-600" },
  rejected:          { label: "Rejected",          cls: "bg-destructive/10 text-destructive" },
  changes_requested: { label: "Changes requested", cls: "bg-amber-500/10 text-amber-700" },
};

function ApprovalCard({ approval, currentUserId, workspaceSlug, projectId, taskId, requestedById }) {
  const [reviewComment, setReviewComment] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const submitReview  = useSubmitReview(workspaceSlug, projectId, taskId, approval.id);
  const resubmit      = useResubmitApproval(workspaceSlug, projectId, taskId, approval.id);

  const myReviewer    = approval.reviewers?.find((r) => r.user?.id === currentUserId);
  const isMyTurn      = myReviewer && myReviewer.status === "pending";
  const isRequester   = approval.requested_by?.id === currentUserId;
  const canResubmit   = isRequester &&
    (approval.status === "changes_requested" || approval.status === "rejected");

  const overallCfg = REVIEWER_STATUS_CONFIG[approval.status] || REVIEWER_STATUS_CONFIG.pending;

  const handleSubmit = (verdict) => {
    submitReview.mutate(
      { status: verdict, comment: reviewComment },
      { onSuccess: () => { setShowReviewForm(false); setReviewComment(""); } },
    );
  };

  return (
    <div className="border border-border rounded-xl p-3 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-semibold">
            Approval · {approval.approved_count}/{approval.total_count} approved
          </span>
        </div>
        <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full", overallCfg.cls)}>
          {overallCfg.label}
        </span>
      </div>

      {approval.note && (
        <p className="text-xs text-muted-foreground italic">{approval.note}</p>
      )}

      {/* Reviewer list */}
      <div className="space-y-2">
        {approval.reviewers?.map((r) => {
          const cfg = REVIEWER_STATUS_CONFIG[r.status] || REVIEWER_STATUS_CONFIG.pending;
          return (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Avatar
                  name={r.user?.display_name || r.user?.full_name || r.user?.email}
                  src={r.user?.avatar}
                  size="xs"
                />
                <span className="text-xs font-medium flex-1">{r.user?.full_name || r.user?.email}</span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", cfg.cls)}>
                  {cfg.label}
                </span>
              </div>
              {/* Show the reviewer's comment when they requested changes or rejected */}
              {r.comment && (
                <div className="ml-6 px-2.5 py-1.5 rounded-md bg-muted/60 border-l-2 border-amber-400 text-xs text-muted-foreground italic">
                  "{r.comment}"
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Re-submit button — shown to the requester when changes were requested / rejected */}
      {canResubmit && (
        <button
          onClick={() => resubmit.mutate()}
          disabled={resubmit.isPending}
          className="w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 font-semibold transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          {resubmit.isPending ? "Re-submitting…" : "Re-submit for review"}
        </button>
      )}

      {/* Reviewer action buttons — only for the reviewer whose turn it is */}
      {isMyTurn && (
        <div>
          {!showReviewForm ? (
            <div className="flex gap-1.5">
              <button
                onClick={() => handleSubmit("approved")}
                disabled={submitReview.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 font-semibold transition-colors"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                onClick={() => setShowReviewForm("changes")}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 font-semibold transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Request changes
              </button>
              <button
                onClick={() => setShowReviewForm("reject")}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 font-semibold transition-colors"
              >
                <XCircle className="w-3 h-3" /> Reject
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                autoFocus
                rows={2}
                placeholder="Add a comment (optional)…"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleSubmit(showReviewForm === "changes" ? "changes_requested" : "rejected")}
                  disabled={submitReview.isPending}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded-md font-semibold transition-colors",
                    showReviewForm === "changes"
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                >
                  {submitReview.isPending ? "Submitting…" : showReviewForm === "changes" ? "Request changes" : "Reject"}
                </button>
                <button
                  onClick={() => setShowReviewForm(false)}
                  className="px-3 text-xs border rounded-md text-muted-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestApprovalDropdown({ members = [], requestApproval, onClose, anchorRef }) {
  const [reviewerIds, setReviewerIds] = useState([]);
  const [dueDate, setDueDate]         = useState("");
  const [note, setNote]               = useState("");
  const [search, setSearch]           = useState("");
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  // Memoised so search typing doesn't re-filter the full list on every parent render
  const filtered = useMemo(
    () =>
      members.filter((m) =>
        (m.user?.full_name || m.user?.email || "")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [members, search],
  );

  const toggle = (id) =>
    setReviewerIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reviewerIds.length) return;
    requestApproval.mutate(
      { reviewer_ids: reviewerIds, due_date: dueDate || null, note },
      { onSuccess: onClose },
    );
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-popover border border-border rounded-xl shadow-xl p-4 space-y-3"
    >
      <p className="text-xs font-semibold flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Request Approval
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Reviewer search */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
            Reviewers
          </label>
          <input
            autoFocus
            placeholder="Search members…"
            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring mb-1.5"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-32 overflow-y-auto space-y-0.5 border border-border rounded-lg p-1">
            {filtered.map((m) => {
              const id = m.user?.id;
              const selected = reviewerIds.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left",
                    selected ? "bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <Avatar
                    name={m.user?.display_name || m.user?.full_name || m.user?.email}
                    src={m.user?.avatar}
                    size="xs"
                  />
                  <span className="flex-1 truncate text-xs">{m.user?.full_name || m.user?.email}</span>
                  {selected && <Check className="w-3 h-3 flex-shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">No members found</p>
            )}
          </div>
        </div>

        {/* Due date */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
            Due date (optional)
          </label>
          <input
            type="date"
            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        {/* Note */}
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">
            Note (optional)
          </label>
          <textarea
            rows={2}
            placeholder="Context for reviewers…"
            className="w-full text-sm border border-border rounded-lg px-2.5 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            disabled={!reviewerIds.length || requestApproval.isPending}
            className="flex-1"
          >
            {requestApproval.isPending ? "Sending…" : "Send request"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
