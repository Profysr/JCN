import { useState, useRef, useEffect, useMemo } from "react";
import {
  SlidersHorizontal,
  MessageSquare,
  Activity,
  Paperclip,
  Link2,
  ShieldCheck,
  Settings,
  Check,
  RotateCcw,
  XCircle,
  Trash2,
  User,
  X,
} from "lucide-react";
import { format } from "date-fns";
import LoadMoreButton from "@/components/ui/LoadMoreButton";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TASK_TYPES } from "@/lib/constants";
import CommentEditor from "@/components/tasks/CommentEditor";
import TaskAttachmentsSection from "@/components/tasks/TaskAttachmentsSection";
import TaskDependenciesSection from "@/components/tasks/TaskDependenciesSection";
import {
  useTaskComments,
  useTaskActivities,
  useCreateComment,
  useDeleteComment,
} from "@/hooks/useTasks";
import { useToggleReaction } from "@/hooks/useCommentReactions";
import { useSubmitReview, useResubmitApproval } from "@/hooks/useApprovals";
import { Switch } from "@/components/ui/switch";
import {
  Dropdown,
  DetailRow,
  LabelPicker,
  PRIORITY_OPTIONS,
  QUICK_EMOJIS,
  REVIEWER_STATUS_CONFIG,
} from "@/components/tasks/TaskDetailShared";

// ── Icon strip ────────────────────────────────────────────────────────────────

export const PANEL_ITEMS = [
  { id: "properties",   icon: SlidersHorizontal, label: "Properties"   },
  { id: "attachments",  icon: Paperclip,          label: "Attachments"  },
  { id: "dependencies", icon: Link2,              label: "Dependencies" },
  { id: "layout",       icon: Settings,           label: "Layout"       },
  { id: "approvals",    icon: ShieldCheck,        label: "Approvals"    },
  { id: "comments",     icon: MessageSquare,      label: "Comments"     },
  { id: "activity",     icon: Activity,           label: "Activity"     },
];

const PANEL_GROUPS = [
  ["properties", "attachments", "dependencies"],
  ["approvals", "comments", "activity"],
  ["layout"],
];

export function IconStrip({ activePanel, onSelect, commentCount, approvalCount, approvalPending }) {
  const itemsById = Object.fromEntries(PANEL_ITEMS.map((p) => [p.id, p]));
  return (
    <div className="w-12 flex-shrink-0 border-l border-border flex flex-col items-center py-3 bg-background">
      {PANEL_GROUPS.map((group, gi) => (
        <div key={gi} className="flex flex-col items-center gap-1 w-full px-1.5">
          {gi > 0 && <div className="w-6 border-t border-border my-1.5" />}
          {group.map((id) => {
            const { icon: Icon, label } = itemsById[id];
            const isActive = activePanel === id;
            const badge =
              id === "comments" && commentCount > 0 ? commentCount :
              id === "approvals" && approvalCount > 0 ? approvalCount : null;
            return (
              <Tooltip key={id} content={label} side="left">
                <button
                  onClick={() => onSelect(id)}
                  className={cn(
                    "relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {badge && (
                    <span
                      className={cn(
                        "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none",
                        id === "approvals" && approvalPending
                          ? "bg-amber-500 text-white"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PanelSectionHeader({ title }) {
  return (
    <div className="px-4 py-3 border-b border-border flex-shrink-0">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
    </div>
  );
}

// ── Properties ────────────────────────────────────────────────────────────────

export function PropertiesPanel({
  task, canEdit, update, projectStatuses, taskLabels, members, onCreateLabel,
}) {
  return (
    <div className="px-4 py-4 space-y-1">
      <DetailRow label="Status">
        <Dropdown
          disabled={!canEdit}
          value={task.status_detail?.id || ""}
          options={projectStatuses.map((s) => ({ value: s.id, label: s.name, color: s.color }))}
          onChange={(v) => update.mutate({ status_id: v })}
          renderTrigger={(opt) =>
            opt ? (
              <div
                className="flex items-center gap-2 font-semibold text-xs px-3 py-1 rounded"
                style={{ backgroundColor: opt.color + "75" }}
              >
                {opt.label}
              </div>
            ) : null
          }
          renderOption={(opt) => (
            <span
              className="flex items-center gap-2 px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: opt.color + "80" }}
            >
              {opt.label}
            </span>
          )}
        />
      </DetailRow>

      <DetailRow label="Priority">
        <Dropdown
          disabled={!canEdit}
          value={task.priority}
          options={PRIORITY_OPTIONS}
          onChange={(v) => update.mutate({ priority: v })}
          renderTrigger={(opt) => {
            if (!opt) return null;
            const Icon = opt.icon;
            return (
              <span className={cn("flex items-center gap-1.5 text-sm", opt.color)}>
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                {opt.label}
              </span>
            );
          }}
          renderOption={(opt) => {
            const Icon = opt.icon;
            return (
              <span className="flex items-center gap-1.5 text-sm">
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
          options={TASK_TYPES.map((t) => ({ ...t }))}
          onChange={(v) => update.mutate({ task_type: v })}
          renderTrigger={(opt) => {
            if (!opt) return null;
            const Icon = opt.icon;
            return (
              <span className={cn("flex items-center gap-1.5 text-sm", opt.color)}>
                {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                {opt.label}
              </span>
            );
          }}
          renderOption={(opt) => {
            const Icon = opt.icon;
            return (
              <span className="flex items-center gap-1.5 text-sm">
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
                <Avatar name={opt.label} size="xs" />
                <span className="text-sm truncate">{opt.label}</span>
              </span>
            )
          }
          renderOption={(opt) => (
            <span className="flex items-center gap-2">
              {opt.value ? (
                <Avatar name={opt.label} size="xs" />
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
          onChange={(e) => update.mutate({ start_date: e.target.value || null })}
          disabled={!canEdit}
        />
      </DetailRow>

      <DetailRow label="Due Date">
        <input
          type="date"
          className="w-full bg-transparent text-sm outline-none cursor-pointer disabled:opacity-70"
          value={task.due_date || ""}
          onChange={(e) => update.mutate({ due_date: e.target.value || null })}
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
            update.mutate({ estimate_points: e.target.value === "" ? null : parseInt(e.target.value) })
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
            update.mutate({ estimate_hours: e.target.value === "" ? null : parseFloat(e.target.value) })
          }
          disabled={!canEdit}
        />
      </DetailRow>

      <div className="pt-1">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
          Labels
        </p>
        <div className="flex flex-wrap gap-1.5 items-center">
          {task.labels?.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                const newIds = (task.labels || []).filter((x) => x.id !== l.id).map((x) => x.id);
                update.mutate({ label_ids: newIds });
              }}
              className="group relative flex items-center gap-1 px-3 py-0.5 rounded text-xs font-medium transition-all"
              style={{ backgroundColor: l.color + "50" }}
              title="Click to remove"
            >
              {l.name}
              <X className="absolute -top-1 -right-1 bg-white rounded-full text-destructive p-0.5 w-3.5 h-3.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
          {canEdit && (
            <LabelPicker
              currentLabels={task.labels || []}
              taskLabels={taskLabels}
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
    </div>
  );
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function CommentsPanel({ workspaceId, boardId, taskId, user, members, typingUsers, focusCommentId = null }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTaskComments(workspaceId, boardId, taskId);
  const createComment = useCreateComment(workspaceId, boardId, taskId);
  const deleteComment = useDeleteComment(workspaceId, boardId, taskId);
  const toggleReaction = useToggleReaction(workspaceId, boardId, taskId);
  const scrolledRef = useRef(false);

  const comments = data?.pages.flatMap((p) => p.results) ?? [];

  // Auto-fetch pages until the target comment appears, then scroll to it.
  useEffect(() => {
    if (!focusCommentId || scrolledRef.current) return;
    const el = document.querySelector(`[data-comment-id="${focusCommentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2", "rounded-md"), 2000);
      scrolledRef.current = true;
    } else if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [focusCommentId, comments, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="p-4 space-y-4">
      <NewCommentComposer
        user={user}
        members={members}
        createComment={createComment}
      />

      {typingUsers.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 pl-9">
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
          </span>
          {typingUsers.map((u) => u.name).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
        </p>
      )}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No comments yet. Be the first to comment.</p>
      ) : (
        <div className="space-y-4">
          {comments.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              user={user}
              members={members}
              createComment={createComment}
              deleteComment={deleteComment}
              toggleReaction={toggleReaction}
            />
          ))}
        </div>
      )}

      {hasNextPage && (
        <LoadMoreButton
          onClick={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
          label="Load more comments"
        />
      )}
    </div>
  );
}

// Composer for new top-level comments
function NewCommentComposer({ user, members, createComment, placeholder = "Write a comment…", onSuccess, compact = false }) {
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(compact);
  const editorRef = useRef(null);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!body.trim()) return;
    const mentioned_user_ids = editorRef.current?.getMentionedIds() ?? [];
    createComment.mutate({ body: body.trim(), mentioned_user_ids }, {
      onSuccess: () => {
        editorRef.current?.clear();
        setBody("");
        setFocused(compact);
        onSuccess?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2.5 items-start">
      {!compact && (
        <Avatar name={user?.display_name || user?.email || "?"} size="sm" className="flex-shrink-0 mt-1.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className={cn("rounded-md border transition-all", focused ? "border-primary ring-2 ring-primary/15" : "border-border")}>
          <CommentEditor
            ref={editorRef}
            members={members}
            onSubmit={handleSubmit}
            onFocus={() => setFocused(true)}
            onChange={setBody}
            placeholder={placeholder}
          />
          {focused && (
            <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
              {!compact && (
                <button
                  type="button"
                  onClick={() => { editorRef.current?.clear(); setBody(""); setFocused(false); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
                >
                  Cancel
                </button>
              )}
              <Button type="submit" size="sm" disabled={!body.trim() || createComment.isPending}>
                {createComment.isPending ? "Sending…" : "Send"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

// A single top-level comment with its replies thread
function CommentThread({ comment: c, user, members, createComment, deleteComment, toggleReaction }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);

  const handleReplySubmit = (body, mentionedIds) => {
    createComment.mutate(
      { body, mentioned_user_ids: mentionedIds, parent_id: c.id },
      { onSuccess: () => setReplyOpen(false) },
    );
  };

  return (
    <div data-comment-id={c.id}>
      {/* Top-level comment */}
      <CommentBubble
        comment={c}
        user={user}
        onDelete={() => deleteComment.mutate({ commentId: c.id, parentId: null })}
        onReply={() => setReplyOpen((v) => !v)}
        toggleReaction={toggleReaction}
        emojiPickerFor={emojiPickerFor}
        setEmojiPickerFor={setEmojiPickerFor}
        showReplyButton
      />

      {/* Replies */}
      {c.replies?.length > 0 && (
        <div className="ml-8 mt-2 pl-3 border-l-2 border-border space-y-3">
          {c.replies.map((reply) => (
            <CommentBubble
              key={reply.id}
              comment={reply}
              user={user}
              onDelete={() => deleteComment.mutate({ commentId: reply.id, parentId: c.id })}
              toggleReaction={toggleReaction}
              emojiPickerFor={emojiPickerFor}
              setEmojiPickerFor={setEmojiPickerFor}
            />
          ))}
        </div>
      )}

      {/* Inline reply composer */}
      {replyOpen && (
        <div className="ml-8 mt-2 pl-3 border-l-2 border-primary/40">
          <InlineReplyComposer
            members={members}
            createComment={createComment}
            parentId={c.id}
            onClose={() => setReplyOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

// Shared bubble for both top-level comments and replies
function CommentBubble({ comment: c, user, onDelete, onReply, toggleReaction, emojiPickerFor, setEmojiPickerFor, showReplyButton = false }) {
  const isOwn = c.author?.email === user?.email;

  return (
    <div className="flex gap-2.5 group">
      <Avatar
        name={c.author?.display_name || c.author?.full_name || c.author?.email}
        size="sm"
        className="flex-shrink-0 mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold">{c.author?.full_name || c.author?.email}</span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(c.created_at), "MMM d, h:mm a")}
          </span>
          {/* action buttons — only visible on hover */}
          <div className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
            {showReplyButton && (
              <button
                onClick={onReply}
                className="text-[10px] text-muted-foreground hover:text-primary px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
              >
                Reply
              </button>
            )}
            {isOwn && (
              <button
                onClick={onDelete}
                className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded hover:bg-destructive/10"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="bg-muted/40 rounded-lg px-3 py-2">
          <p className="text-sm break-words">{c.body}</p>
        </div>

        {/* Reactions */}
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
                <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 bg-popover border border-border rounded-md shadow-popover px-2 py-1.5">
                  {QUICK_EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => { toggleReaction.mutate({ commentId: c.id, emoji: e }); setEmojiPickerFor(null); }}
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
    </div>
  );
}

// Compact inline reply editor (no avatar, cancel button)
function InlineReplyComposer({ members, createComment, parentId, onClose }) {
  const [body, setBody] = useState("");
  const editorRef = useRef(null);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!body.trim()) return;
    const mentioned_user_ids = editorRef.current?.getMentionedIds() ?? [];
    createComment.mutate({ body: body.trim(), mentioned_user_ids, parent_id: parentId }, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="rounded-md border border-primary ring-2 ring-primary/15">
        <CommentEditor
          ref={editorRef}
          members={members}
          onSubmit={handleSubmit}
          onChange={setBody}
          placeholder="Write a reply…"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-md hover:bg-accent transition-colors"
        >
          Cancel
        </button>
        <Button type="submit" size="sm" disabled={!body.trim() || createComment.isPending}>
          {createComment.isPending ? "Sending…" : "Reply"}
        </Button>
      </div>
    </form>
  );
}

// ── Activity ──────────────────────────────────────────────────────────────────

export function ActivityPanel({ workspaceId, boardId, taskId }) {
  return (
    <div className="p-4">
      <ActivityTab workspaceId={workspaceId} boardId={boardId} taskId={taskId} />
    </div>
  );
}

function ActivityTab({ workspaceId, boardId, taskId }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTaskActivities(workspaceId, boardId, taskId);

  const activities = data?.pages.flatMap((p) => p.results) ?? [];

  if (isLoading) return <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>;
  if (!activities.length) return <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>;

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <div className="space-y-3">
        {activities.map((a) => (
          <div key={a.id} className="flex items-start gap-3 relative">
            <Avatar
              name={a.actor?.display_name || a.actor?.full_name || a.actor?.email || "?"}
              size="xs"
              className="flex-shrink-0 mt-0.5 z-10 ring-2 ring-card"
            />
            <div className="flex-1 min-w-0 bg-muted/30 rounded-lg px-3 py-2">
              <span className="text-xs">
                <span className="font-semibold text-foreground">{a.actor?.full_name || "Someone"}</span>{" "}
                {a.verb.replace(/_/g, " ")}
                {a.meta?.from && <>{" "}from <span className="font-semibold text-foreground">{a.meta.from}</span></>}
                {a.meta?.to && <>{" "}to <span className="font-semibold text-foreground">{a.meta.to}</span></>}
              </span>
              <span className="text-[10px] text-muted-foreground ml-2">
                {format(new Date(a.created_at), "MMM d, h:mm a")}
              </span>
            </div>
          </div>
        ))}
      </div>
      {hasNextPage && (
        <LoadMoreButton
          onClick={() => fetchNextPage()}
          isLoading={isFetchingNextPage}
          className="mt-3"
        />
      )}
    </div>
  );
}

// ── Attachments & Dependencies ────────────────────────────────────────────────

export function AttachmentsPanel({ workspaceId, boardId, taskId }) {
  return (
    <div className="p-4">
      <TaskAttachmentsSection workspaceId={workspaceId} boardId={boardId} taskId={taskId} />
    </div>
  );
}

export function DependenciesPanel({ workspaceId, boardId, taskId }) {
  return (
    <div className="p-4">
      <TaskDependenciesSection workspaceId={workspaceId} boardId={boardId} taskId={taskId} />
    </div>
  );
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export function ApprovalsPanel({ approvals, user, workspaceId, boardId, taskId }) {
  if (approvals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2 p-4">
        <ShieldCheck className="w-8 h-8 opacity-30" />
        <p className="text-sm font-medium">No approvals yet</p>
        <p className="text-xs">Use the approval button in the header to request one.</p>
      </div>
    );
  }
  return (
    <div className="p-4 space-y-3">
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.id}
          approval={approval}
          currentUserId={user?.id}
          workspaceId={workspaceId}
          boardId={boardId}
          taskId={taskId}
        />
      ))}
    </div>
  );
}

function ApprovalCard({ approval, currentUserId, workspaceId, boardId, taskId }) {
  const [reviewComment, setReviewComment] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);
  const submitReview = useSubmitReview(workspaceId, boardId, taskId, approval.id);
  const resubmit = useResubmitApproval(workspaceId, boardId, taskId, approval.id);

  const myReviewer = approval.reviewers?.find((r) => r.user?.id === currentUserId);
  const isMyTurn = myReviewer && myReviewer.status === "pending";
  const isRequester = approval.requested_by?.id === currentUserId;
  const canResubmit =
    isRequester && (approval.status === "changes_requested" || approval.status === "rejected");

  const overallCfg = REVIEWER_STATUS_CONFIG[approval.status] || REVIEWER_STATUS_CONFIG.pending;

  const handleSubmit = (verdict) => {
    submitReview.mutate(
      { status: verdict, comment: reviewComment },
      { onSuccess: () => { setShowReviewForm(false); setReviewComment(""); } },
    );
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-3">
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

      {approval.note && <p className="text-xs text-muted-foreground italic">{approval.note}</p>}

      <div className="space-y-2">
        {approval.reviewers?.map((r) => {
          const cfg = REVIEWER_STATUS_CONFIG[r.status] || REVIEWER_STATUS_CONFIG.pending;
          return (
            <div key={r.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Avatar name={r.user?.display_name || r.user?.full_name || r.user?.email} src={r.user?.avatar} size="xs" />
                <span className="text-xs font-medium flex-1">{r.user?.full_name || r.user?.email}</span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", cfg.cls)}>{cfg.label}</span>
              </div>
              {r.comment && (
                <div className="ml-6 px-2.5 py-1.5 rounded-md bg-muted/60 border-l-2 border-amber-400 text-xs text-muted-foreground italic">
                  "{r.comment}"
                </div>
              )}
            </div>
          );
        })}
      </div>

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

// ── Request approval dropdown (used in header) ────────────────────────────────

export function RequestApprovalDropdown({ members = [], requestApproval, onClose, anchorRef }) {
  const [reviewerIds, setReviewerIds] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        anchorRef.current && !anchorRef.current.contains(e.target)
      ) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  const filtered = useMemo(
    () => members.filter((m) =>
      (m.user?.full_name || m.user?.email || "").toLowerCase().includes(search.toLowerCase()),
    ),
    [members, search],
  );

  const toggle = (id) =>
    setReviewerIds((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reviewerIds.length) return;
    requestApproval.mutate({ reviewer_ids: reviewerIds, due_date: dueDate || null, note }, { onSuccess: onClose });
  };

  return (
    <div ref={dropdownRef} className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-popover border border-border rounded-md shadow-xl p-4 space-y-3">
      <p className="text-xs font-semibold flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Request Approval
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Reviewers</label>
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
                  <Avatar name={m.user?.display_name || m.user?.full_name || m.user?.email} src={m.user?.avatar} size="xs" />
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
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Due date (optional)</label>
          <input
            type="date"
            className="w-full text-sm border border-border rounded-lg px-2.5 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Note (optional)</label>
          <textarea
            rows={2}
            placeholder="Context for reviewers…"
            className="w-full text-sm border border-border rounded-lg px-2.5 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!reviewerIds.length || requestApproval.isPending} className="flex-1">
            {requestApproval.isPending ? "Sending…" : "Send request"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}

// ── Layout preferences ────────────────────────────────────────────────────────

export function LayoutPanel({ prefs, onChange }) {
  const descSize = prefs.descriptionSize ?? "comfortable";
  const defaultPanel = prefs.defaultPanel ?? "properties";
  const showWorkItems = prefs.showWorkItems !== false;

  return (
    <div className="px-4 py-4 space-y-6">
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Description Size
        </p>
        <div className="space-y-1">
          {[
            ["compact", "Compact", "~2 lines"],
            ["comfortable", "Comfortable", "~5 lines"],
            ["expanded", "Expanded", "~10 lines"],
          ].map(([val, label, hint]) => (
            <button
              key={val}
              onClick={() => onChange({ descriptionSize: val })}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                descSize === val ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground",
              )}
            >
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                {descSize === val && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className="flex-1">{label}</span>
              <span className="text-[10px] text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Default Panel on Open
        </p>
        <div className="space-y-1">
          {[["properties", "Properties"], [null, "None (closed)"]].map(([val, label]) => {
            const isSelected = (prefs.defaultPanel ?? "properties") === val;
            return (
              <button
                key={String(val)}
                onClick={() => onChange({ defaultPanel: val })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isSelected ? "bg-primary/10 text-primary font-semibold" : "hover:bg-accent text-foreground",
                )}
              >
                <span className="w-4 flex-shrink-0 flex items-center justify-center">
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm font-medium">Show Work Items</p>
          <p className="text-xs text-muted-foreground mt-0.5">Checklist and child tasks in main body</p>
        </div>
        <Switch
          checked={showWorkItems}
          onCheckedChange={(checked) => onChange({ showWorkItems: checked })}
        />
      </div>
    </div>
  );
}
