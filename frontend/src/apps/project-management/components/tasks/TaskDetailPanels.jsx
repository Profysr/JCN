import { useState, useRef, useEffect, useMemo } from "react";
import {
  SlidersHorizontal,
  Paperclip,
  Link2,
  ShieldCheck,
  Settings,
  Check,
  User,
  X,
  Calendar,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { Avatar } from "@/shared/components/ui/avatar";
import { Tooltip } from "@/shared/components/ui/tooltip";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { TASK_TYPES } from "@/shared/lib/constants";
import TaskAttachmentsSection from "@/apps/project-management/components/tasks/TaskAttachmentsSection";
import TaskDependenciesSection from "@/apps/project-management/components/tasks/TaskDependenciesSection";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dropdown,
  LabelPicker,
  PRIORITY_OPTIONS,
} from "@/apps/project-management/components/tasks/TaskDetailShared";
import { getShortcutDisplay } from "@/shared/lib/shortcutsRegistry";

// ── Icon strip ────────────────────────────────────────────────────────────────

export const PANEL_ITEMS = [
  { id: "properties", icon: SlidersHorizontal, label: "Properties" },
  { id: "attachments", icon: Paperclip, label: "Attachments" },
  { id: "dependencies", icon: Link2, label: "Dependencies" },
  { id: "layout", icon: Settings, label: "Layout" },
];

const PANEL_GROUPS = [
  ["properties", "attachments", "dependencies"],
  ["layout"],
];

export function IconStrip({ activePanel, onSelect }) {
  const itemsById = Object.fromEntries(PANEL_ITEMS.map((p) => [p.id, p]));
  return (
    <div className="w-12 flex-shrink-0 border-l border-border flex flex-col items-center py-3 bg-muted/20">
      {PANEL_GROUPS.map((group, gi) => (
        <div
          key={gi}
          className="flex flex-col items-center gap-1 w-full px-1.5"
        >
          {gi > 0 && <div className="w-6 border-t border-border my-1.5" />}
          {group.map((id) => {
            const { icon: Icon, label } = itemsById[id];
            const isActive = activePanel === id;
            return (
              <Tooltip key={id} content={label} side="left">
                <button
                  onClick={() => onSelect(id)}
                  className={cn(
                    "w-9 h-9 flex items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Icon className="w-4 h-4" />
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
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </p>
    </div>
  );
}

// ── Properties ────────────────────────────────────────────────────────────────
// `shortcut` is revealed only on hover (group-hover) — shortcuts shouldn't
// clutter the resting layout.
function PropCell({ label, shortcut, children, className }) {
  return (
    <div className={cn("group flex flex-col gap-0.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-2 flex items-center gap-1.5">
        {label}
        {shortcut && (
          <kbd className="font-mono normal-case tracking-normal bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
            {shortcut}
          </kbd>
        )}
      </span>
      {children}
    </div>
  );
}

function DateField({
  value,
  onChange,
  disabled,
  placeholder = "Not set",
  openSignal = 0,
}) {
  const inputRef = useRef(null);

  let display = placeholder;
  if (value) {
    try {
      display = format(new Date(value + "T12:00:00"), "MMM d, yyyy");
    } catch {}
  }

  const handleClick = () => {
    try {
      inputRef.current?.showPicker();
    } catch {
      inputRef.current?.click();
    }
  };

  // Opened by the ⇧D shortcut.
  useEffect(() => {
    if (openSignal > 0 && !disabled) handleClick();
  }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-xs w-full text-left active:scale-[0.97]",
          disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:bg-accent/50 cursor-pointer",
          value ? "font-semibold text-foreground" : "text-muted-foreground/50",
        )}
      >
        <Calendar className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
        {display}
      </button>
      <input
        ref={inputRef}
        type="date"
        className="sr-only"
        value={value || ""}
        onChange={onChange}
        disabled={disabled}
        tabIndex={-1}
      />
    </div>
  );
}

// ── Estimate suggestion (heuristic) ──────────────────────────────────────────
// Derives a story-point / hours suggestion from signals already on the task —
// no backend, no AI. Description length is the dominant signal; child tasks,
// checklist items, priority and task type nudge it. Mapped onto the Fibonacci
// scale teams use for planning poker.
function suggestEstimate({
  description,
  childCount,
  subtaskCount,
  priority,
  taskType,
}) {
  const text = (description || "")
    .replace(/<[^>]*>/g, " ") // strip any html
    .replace(/[#>*_`~\-]/g, " ") // strip markdown punctuation
    .trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;

  let score = 0;
  score += Math.min(words / 40, 5); // longer specs ⇒ more work (cap 5)
  score += childCount * 1.5; // each child task is real scope
  score += subtaskCount * 0.5; // checklist items are smaller
  if (priority === "urgent") score += 2;
  else if (priority === "high") score += 1;
  if (taskType === "bug") score += 0.5; // bugs carry investigation overhead

  const points =
    score <= 1
      ? 1
      : score <= 2.5
        ? 2
        : score <= 4.5
          ? 3
          : score <= 7.5
            ? 5
            : score <= 11
              ? 8
              : 13;

  return { points, hours: points * 2 };
}

function EstimateSuggestion({ task, childCount, subtaskCount, update }) {
  const [suggestion, setSuggestion] = useState(null);

  const compute = () =>
    setSuggestion(
      suggestEstimate({
        description: task.description,
        childCount,
        subtaskCount,
        priority: task.priority,
        taskType: task.task_type,
      }),
    );

  const apply = () => {
    update.mutate({
      estimate_points: suggestion.points,
      estimate_hours: suggestion.hours,
    });
    setSuggestion(null);
  };

  return (
    <div className="pt-1">
      {!suggestion ? (
        <button
          type="button"
          onClick={compute}
          className="flex items-center gap-1.5 text-[11px] font-medium text-primary/80 hover:text-primary px-2 py-1 rounded-md hover:bg-primary/10 transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Suggest estimate
        </button>
      ) : (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/20">
          <Sparkles className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground flex-1">
            {suggestion.points} pts
            <span className="text-muted-foreground font-normal">
              {" "}
              · ~{suggestion.hours}h
            </span>
          </span>
          <button
            type="button"
            onClick={apply}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setSuggestion(null)}
            className="text-muted-foreground/60 hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export function PropertiesPanel({
  task,
  canEdit,
  update,
  projectStatuses,
  taskLabels,
  members,
  onCreateLabel,
  focusField = null,
  focusTick = 0,
  childCount = 0,
  subtaskCount = 0,
}) {
  // Per-field open signal — increments only for the field a shortcut targeted.
  const sig = (field) => (focusField === field ? focusTick : 0);

  return (
    <div className="px-3 py-4 space-y-3">
      {/* Status ── full width prominent */}
      <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-2">
        <PropCell label="Status" shortcut={getShortcutDisplay("task:status")}>
          <Dropdown
            disabled={!canEdit}
            openSignal={sig("status")}
            value={task.status_detail?.id || ""}
            options={projectStatuses.map((s) => ({
              value: s.id,
              label: s.name,
              color: s.color,
            }))}
            onChange={(v) => update.mutate({ status_id: v })}
            renderTrigger={(opt) =>
              opt ? (
                <div
                  className="w-full text-center font-semibold text-xs py-1 rounded-sm uppercase tracking-wide"
                  style={{
                    backgroundColor: opt.color + "10",
                    color: opt.color,
                  }}
                >
                  {opt.label}
                </div>
              ) : null
            }
            renderOption={(opt) => (
              <span className="flex items-center gap-2 text-xs font-semibold uppercase">
                <span
                  style={{
                    color: opt.color,
                    backgroundColor: opt.color + "25",
                  }}
                  className="px-2 py-0.5 rounded-sm"
                >
                  {opt.label}
                </span>
              </span>
            )}
          />
        </PropCell>

        {/* Priority + Type ── 2 col */}
        <div className="grid grid-cols-2 gap-1.5">
          <PropCell
            label="Priority"
            shortcut={getShortcutDisplay("task:priority")}
          >
            <Dropdown
              disabled={!canEdit}
              openSignal={sig("priority")}
              value={task.priority}
              options={PRIORITY_OPTIONS}
              onChange={(v) => update.mutate({ priority: v })}
              placement="left"
              renderTrigger={(opt) => {
                if (!opt) return null;
                const Icon = opt.icon;
                return (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs font-semibold truncate",
                      opt.color,
                    )}
                  >
                    {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{opt.label}</span>
                  </span>
                );
              }}
              renderOption={(opt) => {
                const Icon = opt.icon;
                return (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      opt.color,
                    )}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                    {opt.label}
                  </span>
                );
              }}
            />
          </PropCell>

          <PropCell label="Type">
            <Dropdown
              disabled={!canEdit}
              value={task.task_type || "task"}
              options={TASK_TYPES.map((t) => ({ ...t }))}
              onChange={(v) => update.mutate({ task_type: v })}
              placement="right"
              renderTrigger={(opt) => {
                if (!opt) return null;
                const Icon = opt.icon;
                return (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs font-semibold truncate",
                      opt.color,
                    )}
                  >
                    {Icon && <Icon className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{opt.label}</span>
                  </span>
                );
              }}
              renderOption={(opt) => {
                const Icon = opt.icon;
                return (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      opt.color,
                    )}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" />}
                    {opt.label}
                  </span>
                );
              }}
            />
          </PropCell>
        </div>

        {/* Assignee ── full width */}
        <PropCell label="Assignee" shortcut={getShortcutDisplay("task:assign")}>
          <Dropdown
            disabled={!canEdit}
            openSignal={sig("assign")}
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
                  <span className="font-semibold text-xs truncate">
                    {opt.label}
                  </span>
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
                <span className="font-semibold text-xs">{opt.label}</span>
              </span>
            )}
          />
        </PropCell>

        <div className="h-px bg-border/40 mx-1" />

        {/* Created by ── read-only */}
        <PropCell label="Created by">
          <div className="flex items-center gap-2 px-2 py-1.5">
            {task.created_by ? (
              <>
                <Avatar
                  name={task.created_by.full_name || task.created_by.email}
                  size="xs"
                />
                <span className="font-semibold text-xs truncate text-foreground">
                  {task.created_by.full_name || task.created_by.email}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground/50">Unknown</span>
            )}
            {task.created_at && (
              <Tooltip
                content={format(
                  new Date(task.created_at),
                  "MMM d, yyyy · h:mm a",
                )}
              >
                <span className="text-[10px] text-muted-foreground/50 ml-auto flex-shrink-0">
                  {format(new Date(task.created_at), "MMM d")}
                </span>
              </Tooltip>
            )}
          </div>
        </PropCell>
      </div>

      {/* Dates + Estimates ── grouped card */}
      <div className="rounded-lg border border-border/50 bg-background/60 p-2.5 space-y-2">
        {/* Dates ── 2 col */}
        <div className="grid grid-cols-2 gap-1.5">
          <PropCell label="Start Date">
            <DateField
              value={task.start_date || ""}
              onChange={(e) =>
                update.mutate({ start_date: e.target.value || null })
              }
              disabled={!canEdit}
            />
          </PropCell>
          <PropCell
            label="Due Date"
            shortcut={getShortcutDisplay("task:due-date")}
          >
            <DateField
              value={task.due_date || ""}
              onChange={(e) =>
                update.mutate({ due_date: e.target.value || null })
              }
              disabled={!canEdit}
              openSignal={sig("due-date")}
            />
          </PropCell>
        </div>

        <div className="h-px bg-border/40 mx-1" />

        {/* Estimates ── 2 col */}
        <div className="grid grid-cols-2 gap-1.5">
          <PropCell label="Story Points">
            <div className="px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors">
              <input
                type="number"
                min="0"
                placeholder="—"
                className="w-full bg-transparent font-semibold text-xs outline-none disabled:opacity-50 [appearance:textfield]"
                value={task.estimate_points ?? ""}
                onChange={(e) =>
                  update.mutate({
                    estimate_points:
                      e.target.value === "" ? null : parseInt(e.target.value),
                  })
                }
                disabled={!canEdit}
              />
            </div>
          </PropCell>
          <PropCell label="Est. Hours">
            <div className="px-2 py-1.5 rounded-lg hover:bg-accent/50 transition-colors">
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="—"
                className="w-full bg-transparent font-semibold text-xs outline-none disabled:opacity-50 [appearance:textfield]"
                value={task.estimate_hours ?? ""}
                onChange={(e) =>
                  update.mutate({
                    estimate_hours:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                disabled={!canEdit}
              />
            </div>
          </PropCell>
        </div>

        {canEdit && (
          <EstimateSuggestion
            task={task}
            childCount={childCount}
            subtaskCount={subtaskCount}
            update={update}
          />
        )}
      </div>

      {/* Labels */}
      <div className="group">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-2 mb-2 flex items-center gap-1.5">
          Labels
          <kbd className="font-mono normal-case tracking-normal bg-muted/60 border border-border/60 rounded px-1 py-px leading-none text-[9px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
            {getShortcutDisplay("task:label")}
          </kbd>
        </p>
        <div className="flex flex-wrap gap-1.5 items-center px-1">
          {task.labels?.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                const newIds = (task.labels || [])
                  .filter((x) => x.id !== l.id)
                  .map((x) => x.id);
                update.mutate({ label_ids: newIds });
              }}
              className="group flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold transition-all hover:opacity-80 active:scale-95"
              style={{ backgroundColor: l.color + "30", color: l.color }}
              title="Click to remove"
            >
              {l.name}
              <X className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
          {canEdit && (
            <LabelPicker
              openSignal={sig("label")}
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
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pl-2 mb-2">
            Contributes to
          </p>
          <div className="flex flex-col gap-1 px-1">
            {task.key_result_links.map((kr) => (
              <span
                key={kr.id}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 text-primary text-xs font-medium"
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

// ── Attachments & Dependencies ────────────────────────────────────────────────
export function AttachmentsPanel({ workspaceId, boardId, taskId }) {
  return (
    <div className="p-4">
      <TaskAttachmentsSection
        workspaceId={workspaceId}
        boardId={boardId}
        taskId={taskId}
      />
    </div>
  );
}

export function DependenciesPanel({ workspaceId, boardId, taskId }) {
  return (
    <div className="p-4">
      <TaskDependenciesSection
        workspaceId={workspaceId}
        boardId={boardId}
        taskId={taskId}
      />
    </div>
  );
}

// ── Request Approval Dropdown ────────────────────────────────────────────────────────
export function RequestApprovalDropdown({
  members = [],
  requestApproval,
  onClose,
  anchorRef,
}) {
  const [reviewerIds, setReviewerIds] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      )
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

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
      className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-popover border border-border rounded-md shadow-xl p-4 space-y-3"
    >
      <p className="text-xs font-semibold flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-primary" /> Request Approval
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
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
                    name={
                      m.user?.display_name || m.user?.full_name || m.user?.email
                    }
                    src={m.user?.avatar}
                    size="xs"
                  />
                  <span className="flex-1 truncate text-xs">
                    {m.user?.full_name || m.user?.email}
                  </span>
                  {selected && <Check className="w-3 h-3 flex-shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No members found
              </p>
            )}
          </div>
        </div>
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

// ── Layout preferences ────────────────────────────────────────────────────────
export function LayoutPanel({ prefs, onChange }) {
  const descSize = prefs.descriptionSize ?? "comfortable";
  // const defaultPanel = prefs.defaultPanel ?? "properties";
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
                descSize === val
                  ? "bg-primary/10 text-primary font-semibold"
                  : "hover:bg-accent text-foreground",
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

      {/* <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Default Panel on Open
        </p>
        <div className="space-y-1">
          {[
            ["properties", "Properties"],
            [null, "None (closed)"],
          ].map(([val, label]) => {
            const isSelected = (prefs.defaultPanel ?? "properties") === val;
            return (
              <button
                key={String(val)}
                onClick={() => onChange({ defaultPanel: val })}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold"
                    : "hover:bg-accent text-foreground",
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
      </div> */}

      <div className="flex items-center justify-between py-1">
        <div>
          <p className="text-sm font-medium">Show Work Items</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Checklist and child tasks in main body
          </p>
        </div>
        <Switch
          checked={showWorkItems}
          onCheckedChange={(checked) => onChange({ showWorkItems: checked })}
        />
      </div>
    </div>
  );
}
