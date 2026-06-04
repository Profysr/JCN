import { useState, useRef, useEffect } from "react";
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
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);

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
      update.mutate({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    createComment.mutate(commentBody.trim(), {
      onSuccess: () => setCommentBody(""),
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
                    // Show total hours logged inside the tab badge if greater than 0
                    count: totalLogged > 0 ? formatDuration(totalLogged) : null,
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
                  {/* Comment input at top (like Jira) */}
                  <form
                    onSubmit={handleCommentSubmit}
                    className="flex gap-3 items-start mb-5"
                  >
                    <Avatar
                      name={user?.display_name || user?.email || "?"}
                      size="sm"
                      className="flex-shrink-0 mt-1"
                    />
                    <div className="flex-1 border border-border rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
                      <MentionTextarea
                        value={commentBody}
                        onChange={setCommentBody}
                        onSubmit={handleCommentSubmit}
                        members={members}
                      />
                      {commentBody.trim() && (
                        <div className="flex justify-end px-2 pb-2">
                          <Button
                            type="submit"
                            size="sm"
                            disabled={createComment.isPending}
                          >
                            {createComment.isPending ? "Sending…" : "Send"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </form>

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
