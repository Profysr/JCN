import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { formatDistanceToNow } from "date-fns";
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Check,
  Link,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import Modal from "@/shared/components/ui/Modal";
import {
  useObjectives,
  useCreateObjective,
  useUpdateObjective,
  useDeleteObjective,
  useCreateKeyResult,
  useDeleteKeyResult,
  useLinkTasks,
  CONFIDENCE_CONFIG,
  TIME_PERIODS,
} from "@/shared/hooks/useGoals";
import { useMembers } from "@/shared/hooks/useMembers";
import api from "@/shared/lib/api";

// ── Circular progress ring ────────────────────────────────────────────────────
function ProgressRing({ pct, confidence, size = 56 }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cfg = CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.on_track;
  const strokeMap = {
    on_track: "#22c55e",
    at_risk: "#f59e0b",
    off_track: "#ef4444",
  };
  const stroke = strokeMap[confidence] || strokeMap.on_track;

  return (
    <div
      className="relative flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tabular-nums">
        {pct}%
      </span>
    </div>
  );
}

// ── KR progress bar ───────────────────────────────────────────────────────────
function KRProgressBar({ kr, workspaceId, objectiveId, canEdit }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const linkedTasks = kr.linked_tasks ?? [];
  const deleteKR = useDeleteKeyResult(workspaceId, objectiveId);
  const linkTasks = useLinkTasks(workspaceId, objectiveId, kr.id);
  const [taskSearch, setTaskSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const abortRef = useRef(null);

  const handleTaskSearchChange = (e) => {
    const val = e.target.value;
    setTaskSearch(val);

    // Cancel the previous in-flight request immediately
    if (abortRef.current) abortRef.current.abort();

    if (val.length < 2) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    api
      .get(`/api/search/?q=${encodeURIComponent(val)}`, {
        signal: controller.signal,
      })
      .then((r) => setSearchResults(r.data?.tasks ?? []))
      .catch((err) => {
        // Ignore abort errors — a new request is already on the way
        if (err.name !== "CanceledError" && err.name !== "AbortError")
          setSearchResults([]);
      });
  };

  // Abort any pending request when the KR row unmounts
  useEffect(() => () => abortRef.current?.abort(), []);

  const toggleTask = (taskId) => {
    const linked = kr.task_ids || [];
    const next = linked.includes(taskId)
      ? linked.filter((id) => id !== taskId)
      : [...linked, taskId];
    linkTasks.mutate(next);
  };

  const doneCount = linkedTasks.filter((t) => t.is_done).length;
  const totalCount = linkedTasks.length;

  return (
    <div className="group flex flex-col gap-1.5 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-2">
        {/* Collapse toggle — only shows when tasks are linked */}
        {linkedTasks.length > 0 ? (
          <button
            onClick={() => setTasksOpen((v) => !v)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left group/title"
          >
            {tasksOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <span className="text-sm font-medium truncate group-hover/title:text-primary transition-colors">
              {kr.title}
            </span>
          </button>
        ) : (
          <span className="text-sm font-medium flex-1 min-w-0 truncate">
            {kr.title}
          </span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">
            {totalCount > 0
              ? `${doneCount}/${totalCount} tasks`
              : "No tasks linked"}
          </span>
          {canEdit && (
            <button
              onClick={() => setLinkOpen((v) => !v)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
              title="Link tasks"
            >
              <Link className="w-3 h-3" />
            </button>
          )}
          {canEdit && (
            <button
              onClick={() => deleteKR.mutate(kr.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-destructive transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${kr.progress}%`,
            backgroundColor:
              kr.progress === 100 ? "#22c55e" : "hsl(var(--primary))",
          }}
        />
      </div>

      <div className="flex justify-end">
        <span className="text-[10px] text-muted-foreground">
          {kr.progress}% complete
        </span>
      </div>

      {/* Collapsible linked task list */}
      {tasksOpen && linkedTasks.length > 0 && (
        <div className="mt-1 ml-4 space-y-0.5 border-l-2 border-border pl-3">
          {linkedTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1">
              {t.is_done ? (
                <div className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                </div>
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-border flex-shrink-0" />
              )}
              <span
                className={cn(
                  "text-xs flex-1 truncate",
                  t.is_done
                    ? "line-through text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {t.title}
              </span>
              {t.status_name && (
                <span className="text-[10px] text-muted-foreground flex-shrink-0 bg-muted px-1.5 py-0.5 rounded">
                  {t.status_name}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Link tasks popover */}
      {linkOpen && (
        <div className="mt-2 border border-border rounded-md bg-popover shadow-popover p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              Link tasks to this key result
            </span>
            <button
              onClick={() => setLinkOpen(false)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            autoFocus
            placeholder="Search tasks…"
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={taskSearch}
            onChange={handleTaskSearchChange}
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {searchResults.slice(0, 10).map((t) => {
              const isLinked = (kr.task_ids || []).includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTask(t.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left transition-colors",
                    isLinked ? "bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  {isLinked && <Check className="w-3 h-3 flex-shrink-0" />}
                  <span className="flex-1 truncate">{t.title}</span>
                </button>
              );
            })}
            {taskSearch.length > 1 && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No tasks found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Objective card ────────────────────────────────────────────────────────────
function ObjectiveCard({ objective, workspaceId }) {
  const [expanded, setExpanded] = useState(true);
  const [addingKR, setAddingKR] = useState(false);
  const [krTitle, setKRTitle] = useState("");
  const deleteObjective = useDeleteObjective(workspaceId);
  const createKR = useCreateKeyResult(workspaceId, objective.id);
  const cfg =
    CONFIDENCE_CONFIG[objective.confidence] || CONFIDENCE_CONFIG.on_track;

  const handleAddKR = (e) => {
    e.preventDefault();
    if (!krTitle.trim()) return;
    createKR.mutate(
      { title: krTitle.trim() },
      {
        onSuccess: () => {
          setKRTitle("");
          setAddingKR(false);
        },
      },
    );
  };

  return (
    <div className="bg-card border border-border rounded-md shadow-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-4 p-4">
        <ProgressRing
          pct={objective.progress}
          confidence={objective.confidence}
          size={56}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-sm leading-snug">
              {objective.title}
            </h3>
            <span
              className={cn(
                "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
                cfg.bg,
                cfg.color,
              )}
            >
              <span
                className={cn(
                  "inline-block w-1.5 h-1.5 rounded-full mr-1",
                  cfg.dot,
                )}
              />
              {cfg.label}
            </span>
          </div>

          {objective.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {objective.description}
            </p>
          )}

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {objective.owner && (
              <span className="flex items-center gap-1">
                <Avatar
                  user={objective.owner}
                  name={objective.owner.full_name || objective.owner.email}
                  size="xs"
                />
                {objective.owner.full_name || objective.owner.email}
              </span>
            )}
            <span className="uppercase font-semibold">
              {objective.time_period}
            </span>
            <span>{objective.key_results?.length || 0} key results</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => deleteObjective.mutate(objective.id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Key results */}
      {expanded && (
        <div className="px-4 pb-3 space-y-0">
          {(objective.key_results || []).length === 0 && !addingKR && (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No key results yet. Add one to start tracking.
            </p>
          )}

          {objective.key_results?.map((kr) => (
            <KRProgressBar
              key={kr.id}
              kr={kr}
              workspaceId={workspaceId}
              objectiveId={objective.id}
              canEdit
            />
          ))}

          {addingKR ? (
            <form onSubmit={handleAddKR} className="flex gap-2 pt-2">
              <input
                autoFocus
                placeholder="Key result title…"
                className="flex-1 text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                value={krTitle}
                onChange={(e) => setKRTitle(e.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                disabled={!krTitle.trim() || createKR.isPending}
              >
                Add
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddingKR(false)}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <button
              onClick={() => setAddingKR(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add key result
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Goals history sparkline ───────────────────────────────────────────────────
function Sparkline({ history = [], width = 80, height = 28 }) {
  if (history.length < 2) return null;
  const values = history.map((h) => parseFloat(h.value));
  const min = Math.min(...values);
  const max = Math.max(...values) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / (max - min)) * height;
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CONFIDENCE_ORDER = { off_track: 0, at_risk: 1, on_track: 2 };

function getCurrentQuarter() {
  const m = new Date().getMonth();
  if (m < 3) return "q1";
  if (m < 6) return "q2";
  if (m < 9) return "q3";
  return "q4";
}

export default function GoalsPage() {
  const { workspaceId } = useParams();
  const currentUser = useAuthStore((s) => s.user);
  const [timePeriod, setTimePeriod] = useState(getCurrentQuarter);
  const [showMine, setShowMine] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    time_period: getCurrentQuarter(),
  });

  const { data: objectives = [], isLoading } = useObjectives(
    workspaceId,
    timePeriod,
  );
  const { data: members = [] } = useMembers(workspaceId);
  const createObjective = useCreateObjective(workspaceId);

  const visibleObjectives = useMemo(() => {
    const filtered = showMine
      ? objectives.filter((o) => o.owner?.id === currentUser?.id)
      : objectives;
    return [...filtered].sort(
      (a, b) =>
        (CONFIDENCE_ORDER[a.confidence] ?? 2) -
        (CONFIDENCE_ORDER[b.confidence] ?? 2),
    );
  }, [objectives, showMine, currentUser]);

  const totalKRs = visibleObjectives.flatMap((o) => o.key_results || []).length;
  const onTrackCount = visibleObjectives.filter(
    (o) => o.confidence === "on_track",
  ).length;
  const needsAttentionCount = visibleObjectives.filter(
    (o) => o.confidence === "off_track" || o.confidence === "at_risk",
  ).length;
  const avgProgress = visibleObjectives.length
    ? Math.round(
        visibleObjectives.reduce((s, o) => s + o.progress, 0) /
          visibleObjectives.length,
      )
    : 0;

  const EmptyState = () => (
    <div className="max-w-2xl mx-auto space-y-8 py-10">
      {/* OKR explainer */}
      <div className="rounded-md border border-border bg-muted/30 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 text-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <p className="font-semibold text-sm">What is the Goals page?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              OKR tracking — Objectives & Key Results
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">
          Goals help your team align on{" "}
          <strong className="text-foreground">what matters most</strong> and
          measure real progress — not just task completion. You set an{" "}
          <strong className="text-foreground">Objective</strong> (the ambitious
          goal) and attach{" "}
          <strong className="text-foreground">Key Results</strong> (the
          measurable outcomes that prove you got there).
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              step: "1",
              title: "Create an Objective",
              desc: "A clear, inspiring goal. e.g. 'Launch v2 and delight users'",
            },
            {
              step: "2",
              title: "Add Key Results",
              desc: "Measurable outcomes. e.g. 'Reach 500 signups' or 'NPS ≥ 45'",
            },
            {
              step: "3",
              title: "Link Tasks",
              desc: "Connect KanbanBoard tasks to a KR so progress updates automatically.",
            },
          ].map((s) => (
            <div
              key={s.step}
              className="bg-background rounded-md border border-border p-3.5 space-y-1.5"
            >
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">
                Step {s.step}
              </span>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            When to use it
          </p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-none">
            {[
              "🎯  Quarterly planning — align the whole team on top priorities",
              "📈  Product launches — track adoption, signups, or revenue milestones",
              "🔧  Engineering health — reduce bug count, improve deploy frequency",
              "🤝  Client projects — show measurable delivery against agreed outcomes",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-xs">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm font-semibold">Ready to set your first goal?</p>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> Create your first objective
        </Button>
      </div>
    </div>
  );
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-bold text-base">Goals</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* Mine / All toggle */}
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
            {[
              { label: "All", value: false },
              { label: "Mine", value: true },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setShowMine(opt.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  showMine === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Time period switcher */}
          <div className="flex items-center gap-0.5 bg-muted/60 rounded-lg p-0.5">
            {TIME_PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setTimePeriod(p.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  timePeriod === p.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Objective
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      {visibleObjectives.length > 0 && (
        <div className="flex items-center gap-6 px-6 py-3 border-b bg-muted/20 flex-shrink-0 text-sm">
          <div>
            <span className="text-muted-foreground">Objectives: </span>
            <span className="font-semibold">{visibleObjectives.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Key Results: </span>
            <span className="font-semibold">{totalKRs}</span>
          </div>
          <div>
            <span className="text-muted-foreground">On Track: </span>
            <span className="font-semibold text-emerald-600">
              {onTrackCount}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Avg Progress: </span>
            <span className="font-semibold">{avgProgress}%</span>
          </div>
          {needsAttentionCount > 0 && (
            <div className="ml-auto">
              <span className="text-amber-600 font-semibold text-xs">
                {needsAttentionCount} need{needsAttentionCount === 1 ? "s" : ""}{" "}
                attention
              </span>
            </div>
          )}
        </div>
      )}

      {/* Objective list */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : objectives.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {visibleObjectives.map((obj) => (
              <ObjectiveCard
                key={obj.id}
                objective={obj}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create objective modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Objective"
        icon={Target}
        iconColor="text-primary"
        confirmLabel={
          createObjective.isPending ? "Creating…" : "Create Objective"
        }
        isConfirmDisabled={!form.title.trim() || createObjective.isPending}
        isLoading={createObjective.isPending}
        onConfirm={() => {
          if (!form.title.trim()) return;
          createObjective.mutate(form, {
            onSuccess: () => {
              setForm({ title: "", description: "", time_period: "q1" });
              setCreateOpen(false);
            },
          });
        }}
        maxWidth="480px"
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Title
            </label>
            <input
              autoFocus
              required
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="e.g. Grow MRR to $100k"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({ ...f, title: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Description (optional)
            </label>
            <textarea
              rows={2}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="What does success look like?"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Time Period
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TIME_PERIODS.filter((p) => p.value !== "all").map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({ ...f, time_period: p.value }))
                  }
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium border transition-colors",
                    form.time_period === p.value
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
