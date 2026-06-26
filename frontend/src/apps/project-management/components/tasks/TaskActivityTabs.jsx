import { useState, useRef, useEffect } from "react";
import { getShortcutDisplay } from "@/shared/lib/shortcutsRegistry";
import {
  Trash2,
  Check,
  RotateCcw,
  XCircle,
  ShieldCheck,
  MessageSquare,
  History,
} from "lucide-react";
import { format } from "date-fns";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/shared/components/ui/Tabs";
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineDot,
  TimelineContent,
} from "@/shared/components/ui/timeline";
import LoadMoreButton from "@/shared/components/ui/LoadMoreButton";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import CommentEditor from "@/apps/project-management/components/tasks/CommentEditor";
import {
  useTaskComments,
  useTaskActivities,
  useCreateComment,
  useDeleteComment,
} from "@/apps/project-management/hooks/useTasks";
import { useToggleReaction } from "@/apps/project-management/hooks/useCommentReactions";
import {
  useSubmitReview,
  useResubmitApproval,
} from "@/apps/project-management/hooks/useApprovals";
import {
  QUICK_EMOJIS,
  REVIEWER_STATUS_CONFIG,
} from "@/apps/project-management/components/tasks/TaskDetailShared";

// ── Comments ──────────────────────────────────────────────────────────────────

function CommentsPanel({
  workspaceId,
  boardId,
  taskId,
  user,
  members,
  // typingUsers,   // typing indicators — disabled
  focusCommentId = null,
  commentCount = 0,
  focusCommentTick = 0,
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useTaskComments(workspaceId, boardId, taskId);
  const createComment = useCreateComment(workspaceId, boardId, taskId);
  const deleteComment = useDeleteComment(workspaceId, boardId, taskId);
  const toggleReaction = useToggleReaction(workspaceId, boardId, taskId);
  const scrolledRef = useRef(false);

  const comments = data?.pages.flatMap((p) => p.results) ?? [];

  // When arriving from a notification link that carries a focusCommentId:
  // - If the comment is already in the DOM, scroll it into view and flash a highlight ring for 2 s so the user knows which one was linked.
  // - If it hasn't loaded yet, keep paginating until it appears. scrolledRef prevents re-triggering the scroll on every render after it runs.
  useEffect(() => {
    if (!focusCommentId || scrolledRef.current) return;
    const el = document.querySelector(`[data-comment-id="${focusCommentId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-2", "rounded-md");
      setTimeout(
        () =>
          el.classList.remove(
            "ring-2",
            "ring-primary",
            "ring-offset-2",
            "rounded-md",
          ),
        5000,
      );
      scrolledRef.current = true;
    } else if (hasNextPage && !isFetchingNextPage) {
      // Comment not rendered yet — load the next page and retry on next render.
      fetchNextPage();
    }
  }, [focusCommentId, comments, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4">
      <CommentComposer
        user={user}
        members={members}
        createComment={createComment}
        focusCommentTick={focusCommentTick}
      />

      {/* typing indicator — disabled
      {typingUsers?.length > 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1 pl-9">
          <span className="inline-flex gap-0.5">
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
            <span className="w-1 h-1 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
          </span>
          {typingUsers.map((u) => u.name).join(", ")}{" "}
          {typingUsers.length === 1 ? "is" : "are"} typing…
        </p>
      )}
      */}

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No comments yet. Be the first to comment.
        </p>
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

function CommentComposer({
  user,
  members,
  createComment,
  parentId = null,
  placeholder,
  onClose,
  focusCommentTick = 0,
}) {
  const isReply = !!parentId;
  const [body, setBody] = useState("");
  const [focused, setFocused] = useState(isReply);
  const editorRef = useRef(null);

  // Triggered by the `i` keyboard shortcut via jcn:task-action → focusCommentTick signal
  useEffect(() => {
    if (focusCommentTick > 0) {
      editorRef.current?.focus();
      setFocused(true);
    }
  }, [focusCommentTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!body.trim()) return;
    const mentioned_user_ids = editorRef.current?.getMentionedIds() ?? [];
    createComment.mutate(
      { body: body.trim(), mentioned_user_ids, ...(parentId && { parent_id: parentId }) },
      {
        onSuccess: () => {
          editorRef.current?.clear();
          setBody("");
          isReply ? onClose?.() : setFocused(false);
        },
      },
    );
  };

  const handleCancel = () => {
    if (isReply) {
      onClose?.();
    } else {
      editorRef.current?.clear();
      setBody("");
      setFocused(false);
    }
  };

  const showActions = focused || isReply;

  return (
    <form onSubmit={handleSubmit} className="flex gap-2.5 items-start">
      {!isReply && (
        <Avatar
          name={user?.display_name || user?.email || "?"}
          size="sm"
          className="flex-shrink-0 mt-1.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "rounded-md border transition-all",
            showActions ? "border-primary ring-2 ring-primary/15" : "border-border",
          )}
        >
          <CommentEditor
            ref={editorRef}
            members={members}
            onSubmit={handleSubmit}
            onFocus={() => setFocused(true)}
            onChange={setBody}
            placeholder={placeholder ?? (isReply ? "Write a reply…" : "Write a comment…")}
          />
          {showActions && (
            <div className="flex items-center justify-end gap-2 px-3 pb-2.5">
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
              >
                Cancel
              </button>
              <Button
                type="submit"
                size="sm"
                disabled={!body.trim() || createComment.isPending}
              >
                {createComment.isPending ? "Sending…" : isReply ? "Reply" : "Send"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

function CommentThread({
  comment: c,
  user,
  members,
  createComment,
  deleteComment,
  toggleReaction,
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [emojiPickerFor, setEmojiPickerFor] = useState(null);

  return (
    <div data-comment-id={c.id}>
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

      {c.replies?.length > 0 && (
        <Timeline className="ml-6 mt-1">
          {c.replies.map((reply) => (
            <TimelineItem key={reply.id}>
              <TimelineSeparator>
                <TimelineDot dotClassName="bg-muted-foreground/30" />
              </TimelineSeparator>
              <TimelineContent className="py-1.5">
                <CommentBubble
                  comment={reply}
                  user={user}
                  onDelete={() =>
                    deleteComment.mutate({ commentId: reply.id, parentId: c.id })
                  }
                  toggleReaction={toggleReaction}
                  emojiPickerFor={emojiPickerFor}
                  setEmojiPickerFor={setEmojiPickerFor}
                />
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      )}

      {replyOpen && (
        <div className="ml-8 mt-2 pl-3 border-l-2 border-primary/40">
          <CommentComposer
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

function CommentBubble({
  comment: c,
  user,
  onDelete,
  onReply,
  toggleReaction,
  emojiPickerFor,
  setEmojiPickerFor,
  showReplyButton = false,
}) {
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
          <span className="text-sm font-semibold">
            {c.author?.full_name || c.author?.email}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(c.created_at), "MMM d, h:mm a")}
          </span>
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
              onClick={() =>
                setEmojiPickerFor(emojiPickerFor === c.id ? null : c.id)
              }
              className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs text-muted-foreground hover:bg-muted border border-dashed border-border transition-all"
              title="Add reaction"
            >
              +
            </button>
            {emojiPickerFor === c.id && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setEmojiPickerFor(null)}
                />
                <div className="absolute bottom-full left-0 mb-1 z-50 flex gap-1 bg-popover border border-border rounded-md shadow-popover px-2 py-1.5">
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
    </div>
  );
}


// ── Activity ──────────────────────────────────────────────────────────────────
function ActivityTab({ workspaceId, boardId, taskId }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useTaskActivities(workspaceId, boardId, taskId);

  const activities = data?.pages.flatMap((p) => p.results) ?? [];

  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
    );
  if (!activities.length)
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        No activity yet.
      </p>
    );

  return (
    <div>
      <Timeline>
        {activities.map((a) => (
          <TimelineItem key={a.id}>
            <TimelineSeparator>
              <TimelineDot dotClassName="bg-muted-foreground/40" />
            </TimelineSeparator>
            <TimelineContent>
              <div className="flex items-start gap-2">
                <Avatar
                  name={a.actor?.full_name || a.actor?.email || "?"}
                  size="xs"
                  className="flex-shrink-0 mt-px"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug">
                    <span className="font-semibold text-foreground">
                      {a.actor?.full_name || "Someone"}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {a.verb.replace(/_/g, " ")}
                    </span>
                    {a.meta?.from && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">from</span>{" "}
                        <span className="font-medium text-foreground bg-muted px-1 py-px rounded text-[11px]">
                          {a.meta.from}
                        </span>
                      </>
                    )}
                    {a.meta?.to && (
                      <>
                        {" "}
                        <span className="text-muted-foreground">to</span>{" "}
                        <span className="font-medium text-foreground bg-muted px-1 py-px rounded text-[11px]">
                          {a.meta.to}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                    {format(new Date(a.created_at), "MMM d, h:mm a")}
                  </p>
                </div>
              </div>
            </TimelineContent>
          </TimelineItem>
        ))}
      </Timeline>

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

// ── Approvals ─────────────────────────────────────────────────────────────────
function ApprovalsPanel({ approvals, user, workspaceId, boardId, taskId }) {
  if (!approvals.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground gap-2">
        <ShieldCheck className="w-8 h-8 opacity-30" />
        <p className="text-sm font-medium">No approvals yet</p>
        <p className="text-xs">
          Use the approval button in the header to request one.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
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
    isRequester &&
    (approval.status === "changes_requested" || approval.status === "rejected");

  const overallCfg =
    REVIEWER_STATUS_CONFIG[approval.status] || REVIEWER_STATUS_CONFIG.pending;

  const handleSubmit = (verdict) => {
    submitReview.mutate(
      { status: verdict, comment: reviewComment },
      {
        onSuccess: () => {
          setShowReviewForm(false);
          setReviewComment("");
        },
      },
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
        <span
          className={cn(
            "text-[11px] font-semibold px-2 py-0.5 rounded-full",
            overallCfg.cls,
          )}
        >
          {overallCfg.label}
        </span>
      </div>

      {approval.note && (
        <p className="text-xs text-muted-foreground italic">{approval.note}</p>
      )}

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
                <span className="text-xs font-medium flex-1">
                  {r.user?.full_name || r.user?.email}
                </span>
                <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", cfg.cls)}>
                  {cfg.label}
                </span>
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
                  onClick={() =>
                    handleSubmit(
                      showReviewForm === "changes" ? "changes_requested" : "rejected",
                    )
                  }
                  disabled={submitReview.isPending}
                  className={cn(
                    "flex-1 text-xs py-1.5 rounded-md font-semibold transition-colors",
                    showReviewForm === "changes"
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  )}
                >
                  {submitReview.isPending
                    ? "Submitting…"
                    : showReviewForm === "changes"
                      ? "Request changes"
                      : "Reject"}
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

// ── Main export ───────────────────────────────────────────────────────────────
export function ActivityTabsSection({
  workspaceId,
  boardId,
  taskId,
  user,
  members,
  // typingUsers,   // typing indicators — disabled
  focusCommentId,
  commentCount = 0,
  approvals = [],
}) {
  const [tab, setTab] = useState("comments");
  const [focusCommentTick, setFocusCommentTick] = useState(0);

  useEffect(() => {
    const handler = (ev) => {
      const { action } = ev.detail ?? {};
      if (action === "tab-comments") { setTab("comments"); return; }
      if (action === "tab-activity") { setTab("activity"); return; }
      if (action === "tab-approvals") { setTab("approvals"); return; }
      if (action === "focus-comment") {
        setTab("comments");
        setFocusCommentTick((n) => n + 1);
      }
    };
    window.addEventListener("jcn:task-action", handler);
    return () => window.removeEventListener("jcn:task-action", handler);
  }, []);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onChange={setTab}>
        <TabsList>
          <TabsTrigger value="comments" icon={MessageSquare} badge={commentCount}>
            Comments <kbd className="font-mono normal-case tracking-normal bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] opacity-60">{getShortcutDisplay("panel:tab-comments")}</kbd>
          </TabsTrigger>
          <TabsTrigger value="activity" icon={History}>
            Activity <kbd className="font-mono normal-case tracking-normal bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] opacity-60">{getShortcutDisplay("panel:tab-activity")}</kbd>
          </TabsTrigger>
          <TabsTrigger value="approvals" icon={ShieldCheck} badge={approvals.length || null}>
            Approvals <kbd className="font-mono normal-case tracking-normal bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] opacity-60">{getShortcutDisplay("panel:tab-approvals")}</kbd>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "comments" && (
        <CommentsPanel
          workspaceId={workspaceId}
          boardId={boardId}
          taskId={taskId}
          user={user}
          members={members}
          focusCommentId={focusCommentId}
          commentCount={commentCount}
          focusCommentTick={focusCommentTick}
        />
      )}

      {tab === "activity" && (
        <ActivityTab
          workspaceId={workspaceId}
          boardId={boardId}
          taskId={taskId}
        />
      )}

      {tab === "approvals" && (
        <ApprovalsPanel
          approvals={approvals}
          user={user}
          workspaceId={workspaceId}
          boardId={boardId}
          taskId={taskId}
        />
      )}
    </div>
  );
}
