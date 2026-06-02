import { useState, useRef, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import {
  X, Flag, Calendar, User, CheckSquare, MessageSquare,
  ChevronDown, Trash2, Plus, Check, Activity, Tag, Link2, Layers, Copy,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { useDeleteTask } from "@/hooks/useTasks";
import { useToast } from "@/components/ui/toast";
import { TASK_TYPES, getTaskType } from "@/lib/taskTypes";
import { useTaskDetail, useUpdateTaskDetail, useCreateComment, useDeleteComment, useCreateSubtask, useToggleSubtask, useDeleteSubtask } from "@/hooks/useTaskDetail";
import { useUpsertFieldValue } from "@/hooks/useCustomFields";
import { useMembers } from "@/hooks/useMembers";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import MentionTextarea from "@/components/tasks/MentionTextarea";
import TaskAttachmentsSection from "@/components/tasks/TaskAttachmentsSection";
import TaskDependenciesSection from "@/components/tasks/TaskDependenciesSection";

const LABEL_COLORS = ["#6366f1","#ec4899","#f59e0b","#22c55e","#3b82f6","#ef4444","#8b5cf6","#14b8a6"];

const PRIORITY_OPTIONS = [
  { value: "no_priority", label: "No Priority",  color: "text-muted-foreground" },
  { value: "low",         label: "Low",           color: "text-blue-500" },
  { value: "medium",      label: "Medium",        color: "text-yellow-500" },
  { value: "high",        label: "High",          color: "text-orange-500" },
  { value: "urgent",      label: "Urgent",        color: "text-red-500" },
];

export default function TaskDetailPanel({ taskId, projectStatuses = [], projectLabels = [], projectFields = [], onCreateLabel, onClose, canEdit = true }) {
  const { workspaceSlug, projectId } = useParams();
  const { user } = useAuthStore();
  const { data: members = [] } = useMembers(workspaceSlug);
  const { data: task, isLoading } = useTaskDetail(workspaceSlug, projectId, taskId);
  const update = useUpdateTaskDetail(workspaceSlug, projectId, taskId);
  const upsertField = useUpsertFieldValue(workspaceSlug, projectId, taskId);
  const createComment = useCreateComment(workspaceSlug, projectId, taskId);
  const deleteComment = useDeleteComment(workspaceSlug, projectId, taskId);
  const createSubtask = useCreateSubtask(workspaceSlug, projectId, taskId);
  const toggleSubtask = useToggleSubtask(workspaceSlug, projectId, taskId);
  const deleteSubtask = useDeleteSubtask(workspaceSlug, projectId, taskId);
  const deleteTask = useDeleteTask(workspaceSlug, projectId);
  const { toast } = useToast();

  const [commentBody, setCommentBody] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const titleRef = useRef(null);

  useEffect(() => {
    if (editingTitle && titleRef.current) titleRef.current.focus();
  }, [editingTitle]);

  if (isLoading || !task) {
    return (
      <div className="w-[480px] border-l flex items-center justify-center bg-card animate-panel-in">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const priority = PRIORITY_OPTIONS.find((p) => p.value === task.priority) || PRIORITY_OPTIONS[0];

  const handleTitleSave = () => {
    if (titleDraft.trim() && titleDraft !== task.title) update.mutate({ title: titleDraft.trim() });
    setEditingTitle(false);
  };

  const handleCommentSubmit = (e) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    createComment.mutate(commentBody.trim(), { onSuccess: () => setCommentBody("") });
  };

  const handleSubtaskAdd = (e) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    createSubtask.mutate(newSubtask.trim(), { onSuccess: () => setNewSubtask("") });
  };

  return (
    <div className="w-[480px] flex-shrink-0 border-l flex flex-col bg-card overflow-hidden animate-panel-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0 bg-card">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Task detail</span>
        <div className="flex items-center gap-1">
          {/* Copy link */}
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

          {/* Delete task — editors and above only */}
          {canEdit && (
            <Tooltip content="Delete task">
              <button
                onClick={() => {
                  if (window.confirm("Delete this task? This cannot be undone.")) {
                    deleteTask.mutate(taskId, { onSuccess: onClose });
                  }
                }}
                className="p-1.5 rounded-md bg-accent/60 text-foreground/70 hover:text-destructive hover:bg-destructive/10 transition-colors active:scale-[0.97]"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}

          {/* Close */}
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

      <div className="flex-1 overflow-y-auto">
        <div className="px-5 py-4 space-y-5">

          {/* Title */}
          <div>
            {editingTitle && canEdit ? (
              <textarea
                ref={titleRef}
                className="w-full text-lg font-semibold resize-none bg-transparent border-b border-primary outline-none pb-1"
                value={titleDraft}
                rows={2}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTitleSave(); } }}
              />
            ) : (
              <h2
                className={cn("text-lg font-semibold rounded px-1 -mx-1 py-0.5",
                  canEdit && "cursor-text hover:bg-accent/50"
                )}
                onClick={() => canEdit && (setTitleDraft(task.title), setEditingTitle(true))}
              >
                {task.title}
              </h2>
            )}
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Status */}
            <MetaField label="Status" icon={<ChevronDown className="w-3.5 h-3.5" />}>
              <select
                className="w-full bg-card outline-none text-sm cursor-pointer disabled:cursor-default disabled:opacity-70"
                value={task.status_detail?.id || ""}
                onChange={(e) => update.mutate({ status_id: e.target.value })}
                disabled={!canEdit}
              >
                {projectStatuses.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </MetaField>

            {/* Priority */}
            <MetaField label="Priority" icon={<Flag className={cn("w-3.5 h-3.5", priority.color)} />}>
              <select
                className="w-full bg-card outline-none text-sm cursor-pointer disabled:cursor-default disabled:opacity-70"
                value={task.priority}
                onChange={(e) => update.mutate({ priority: e.target.value })}
                disabled={!canEdit}
              >
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </MetaField>

            {/* Type */}
            <MetaField label="Type" icon={<Layers className="w-3.5 h-3.5" />}>
              <select
                className="w-full bg-card outline-none text-sm cursor-pointer disabled:cursor-default disabled:opacity-70"
                value={task.task_type || "task"}
                onChange={(e) => update.mutate({ task_type: e.target.value })}
                disabled={!canEdit}
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </MetaField>

            {/* Assignee */}
            <MetaField label="Assignee" icon={<User className="w-3.5 h-3.5" />}>
              <select
                className="w-full bg-card outline-none text-sm cursor-pointer disabled:cursor-default disabled:opacity-70"
                value={task.assignee?.id || ""}
                onChange={(e) => update.mutate({ assignee_id: e.target.value || null })}
                disabled={!canEdit}
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.user?.id} value={m.user?.id}>
                    {m.user?.full_name || m.user?.email}
                  </option>
                ))}
              </select>
            </MetaField>

            {/* Due date */}
            <MetaField label="Due Date" icon={<Calendar className="w-3.5 h-3.5" />}>
              <input
                type="date"
                className="w-full bg-card outline-none text-sm cursor-pointer disabled:cursor-default disabled:opacity-70"
                value={task.due_date || ""}
                onChange={(e) => update.mutate({ due_date: e.target.value || null })}
                disabled={!canEdit}
              />
            </MetaField>

            {/* Created by */}
            <MetaField label="Created by" icon={<User className="w-3.5 h-3.5" />}>
              <span className="text-sm truncate">{task.created_by?.full_name || task.created_by?.email || "—"}</span>
            </MetaField>
          </div>

          {/* Description */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Description</p>
            <DescriptionEditor task={task} onSave={(desc) => update.mutate({ description: desc })} canEdit={canEdit} />
          </div>

          {/* Labels */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">Labels</p>
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {task.labels?.map((l) => (
                <button
                  key={l.id}
                  onClick={() => {
                    const newIds = (task.labels || []).filter((x) => x.id !== l.id).map((x) => x.id);
                    update.mutate({ label_ids: newIds });
                  }}
                  className="group flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
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
                    const currentIds = (task.labels || []).map((l) => l.id);
                    const newIds = currentIds.includes(label.id)
                      ? currentIds.filter((id) => id !== label.id)
                      : [...currentIds, label.id];
                    update.mutate({ label_ids: newIds });
                  }}
                  onCreateLabel={onCreateLabel}
                />
              )}
            </div>
          </div>

          {/* Custom Fields */}
          {projectFields.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Custom Fields</p>
              <div className="space-y-2">
                {projectFields.map((field) => {
                  const fv = task.field_values?.find(v => v.field.id === field.id);
                  const val = fv?.value ?? "";
                  const save = (newVal) => {
                    if (newVal !== val) upsertField.mutate({ field_id: field.id, value: newVal });
                  };
                  return (
                    <div key={field.id} className="rounded-md border px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-1">{field.name}</p>
                      <CustomFieldInput field={field} value={val} onSave={save} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Subtasks */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <CheckSquare className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                Subtasks {task.subtasks?.length > 0 && `(${task.done_subtask_count}/${task.subtask_count})`}
              </p>
            </div>
            <div className="space-y-1.5 mb-2">
              {task.subtasks?.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 group">
                  <button
                    onClick={() => canEdit && toggleSubtask.mutate({ subtaskId: sub.id, is_done: !sub.is_done })}
                    disabled={!canEdit}
                    className={cn(
                      "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors",
                      sub.is_done ? "bg-primary border-primary" : "border-border",
                      canEdit && "hover:border-primary"
                    )}
                  >
                    {sub.is_done && <Check className="w-2.5 h-2.5 text-white" />}
                  </button>
                  <span className={cn("text-sm flex-1", sub.is_done && "line-through text-muted-foreground")}>
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
                  placeholder="Add subtask…"
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                />
                {newSubtask && (
                  <button type="submit" className="text-primary text-xs font-medium">Add</button>
                )}
              </form>
            )}
          </div>

          {/* Comments */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                Comments {task.comments?.length > 0 && `(${task.comments.length})`}
              </p>
            </div>
            <div className="space-y-3 mb-3">
              {task.comments?.map((c) => (
                <div key={c.id} className="flex gap-2.5 group">
                  <Avatar
                    name={c.author?.display_name || c.author?.full_name || c.author?.email}
                    size="sm"
                    className="flex-shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-medium">{c.author?.full_name || c.author?.email}</span>
                      <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "MMM d, h:mm a")}</span>
                    </div>
                    <p className="text-sm mt-0.5 break-words">{c.body}</p>
                  </div>
                  {c.author?.email === user?.email && (
                    <button
                      onClick={() => deleteComment.mutate(c.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleCommentSubmit} className="flex gap-2 items-end">
              <div className="flex-1">
                <MentionTextarea
                  value={commentBody}
                  onChange={setCommentBody}
                  onSubmit={handleCommentSubmit}
                  members={members}
                />
              </div>
              <Button type="submit" size="sm" disabled={!commentBody.trim() || createComment.isPending}>
                Send
              </Button>
            </form>
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

          {/* Activity */}
          {task.activities?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Activity</p>
              </div>
              <div className="space-y-2">
                {task.activities.map((a) => (
                  <div key={a.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Avatar
                      name={a.actor?.display_name || a.actor?.full_name || a.actor?.email || "?"}
                      size="xs"
                      className="flex-shrink-0 mt-0.5"
                    />
                    <span>
                      <span className="font-medium text-foreground">{a.actor?.full_name || "Someone"}</span>
                      {" "}{a.verb.replace(/_/g, " ")}
                      {a.meta?.from && <> from <span className="font-medium text-foreground">{a.meta.from}</span></>}
                      {a.meta?.to   && <> to <span className="font-medium text-foreground">{a.meta.to}</span></>}
                      <span className="ml-1.5">{format(new Date(a.created_at), "MMM d, h:mm a")}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
        onChange={e => onSave(e.target.value)}
      >
        <option value="">— none —</option>
        {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }

  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
      className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      placeholder={`Enter ${field.name.toLowerCase()}…`}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
    />
  );
}

function LabelPicker({ currentLabels, projectLabels, onToggle, onCreateLabel }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentIds = new Set(currentLabels.map((l) => l.id));

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onCreateLabel?.({ name: newName.trim(), color: newColor }, {
      onSuccess: () => setNewName(""),
    });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs text-muted-foreground border border-dashed rounded-full px-2 py-0.5 hover:text-foreground hover:border-foreground/40 transition-colors"
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
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
                    <span className="flex-1 text-left">{l.name}</span>
                    {currentIds.has(l.id) && <Check className="w-3.5 h-3.5 text-primary" />}
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
                    newColor === c && "ring-2 ring-offset-1 ring-ring scale-110"
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

function DescriptionEditor({ task, onSave, canEdit = true }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.description || "");
  const ref = useRef(null);

  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  const save = () => {
    if (draft !== task.description) onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div
        onClick={() => canEdit && (setDraft(task.description || ""), setEditing(true))}
        className={cn(
          "text-sm text-muted-foreground rounded px-1 -mx-1 py-1 min-h-[36px]",
          canEdit && "cursor-text hover:bg-accent/50"
        )}
      >
        {task.description || <span className="italic">{canEdit ? "Add a description…" : "No description."}</span>}
      </div>
    );
  }

  return (
    <div>
      <textarea
        ref={ref}
        className="w-full text-sm border rounded-md p-2 bg-transparent outline-none focus:border-primary resize-none"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
      />
    </div>
  );
}
