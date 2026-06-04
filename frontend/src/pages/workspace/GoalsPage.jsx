import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  Target, Plus, ChevronDown, ChevronRight, Trash2,
  Check, Link, X, Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  useObjectives, useCreateObjective, useUpdateObjective, useDeleteObjective,
  useCreateKeyResult, useUpdateKeyResult, useDeleteKeyResult, useLinkTasks,
  CONFIDENCE_CONFIG, TIME_PERIODS,
} from "@/hooks/useGoals";
import { useMembers } from "@/hooks/useMembers";
import { useSearch } from "@/hooks/useSearch";

// ── Circular progress ring ────────────────────────────────────────────────────
function ProgressRing({ pct, confidence, size = 56 }) {
  const r   = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash  = (pct / 100) * circ;
  const cfg   = CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.on_track;
  const strokeMap = { on_track: "#22c55e", at_risk: "#f59e0b", off_track: "#ef4444" };
  const stroke = strokeMap[confidence] || strokeMap.on_track;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={stroke} strokeWidth={5}
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
function KRProgressBar({ kr, workspaceSlug, objectiveId, canEdit }) {
  const [editing,  setEditing]  = useState(false);
  const [newValue, setNewValue] = useState(String(kr.current_value));
  const [linkOpen, setLinkOpen] = useState(false);
  const updateKR  = useUpdateKeyResult(workspaceSlug, objectiveId);
  const deleteKR  = useDeleteKeyResult(workspaceSlug, objectiveId);
  const linkTasks = useLinkTasks(workspaceSlug, objectiveId, kr.id);
  const [taskSearch, setTaskSearch] = useState("");
  const { data: searchResults = [] } = useSearch(workspaceSlug, taskSearch, { enabled: linkOpen && taskSearch.length > 1 });

  const commitValue = () => {
    const v = parseFloat(newValue);
    if (!isNaN(v) && v !== parseFloat(kr.current_value)) {
      updateKR.mutate({ id: kr.id, current_value: v });
    }
    setEditing(false);
  };

  const toggleTask = (taskId) => {
    const linked = kr.task_ids || [];
    const next = linked.includes(taskId)
      ? linked.filter((id) => id !== taskId)
      : [...linked, taskId];
    linkTasks.mutate(next);
  };

  const isPercent  = kr.metric_type === "percentage";
  const isMilestone = kr.metric_type === "milestone";
  const displayCurrent = isMilestone
    ? `${kr.done_task_count ?? 0}/${kr.task_count ?? 0} tasks`
    : `${parseFloat(kr.current_value).toLocaleString()}${kr.unit ? " " + kr.unit : ""}`;

  return (
    <div className="group flex flex-col gap-1.5 py-2.5 border-b border-border/50 last:border-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium flex-1 min-w-0 truncate">{kr.title}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-muted-foreground">{displayCurrent}</span>
          {!isMilestone && canEdit && (
            <button
              onClick={() => { setNewValue(String(kr.current_value)); setEditing(true); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-all"
              title="Update value"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
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
            backgroundColor: kr.progress === 100 ? "#22c55e" : "hsl(var(--primary))",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{isPercent ? `${kr.start_value}%` : kr.start_value}</span>
        <span className="font-medium text-foreground">{kr.progress}% complete</span>
        <span>{isPercent ? `${kr.target_value}%` : kr.target_value}{kr.unit ? " " + kr.unit : ""}</span>
      </div>

      {/* Inline value editor */}
      {editing && (
        <div className="flex items-center gap-2 mt-1">
          <input
            autoFocus
            type="number"
            className="flex-1 text-sm border border-border rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitValue();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button onClick={commitValue} className="text-xs px-2 py-1 rounded-md bg-primary text-primary-foreground font-medium">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs px-2 py-1 rounded-md border text-muted-foreground">
            Cancel
          </button>
        </div>
      )}

      {/* Link tasks popover */}
      {linkOpen && (
        <div className="mt-2 border border-border rounded-xl bg-popover shadow-popover p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">Link tasks to this key result</span>
            <button onClick={() => setLinkOpen(false)} className="p-0.5 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </div>
          <input
            autoFocus
            placeholder="Search tasks…"
            className="w-full text-xs border border-border rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
          />
          <div className="max-h-36 overflow-y-auto space-y-0.5">
            {searchResults.slice(0, 8).map((t) => {
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
              <p className="text-xs text-muted-foreground text-center py-2">No tasks found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Objective card ────────────────────────────────────────────────────────────
function ObjectiveCard({ objective, workspaceSlug }) {
  const [expanded, setExpanded] = useState(true);
  const [addingKR, setAddingKR] = useState(false);
  const [krTitle,  setKRTitle]  = useState("");
  const deleteObjective = useDeleteObjective(workspaceSlug);
  const createKR        = useCreateKeyResult(workspaceSlug, objective.id);
  const cfg = CONFIDENCE_CONFIG[objective.confidence] || CONFIDENCE_CONFIG.on_track;

  const handleAddKR = (e) => {
    e.preventDefault();
    if (!krTitle.trim()) return;
    createKR.mutate(
      { title: krTitle.trim(), metric_type: "percentage", start_value: 0, target_value: 100, current_value: 0 },
      { onSuccess: () => { setKRTitle(""); setAddingKR(false); } },
    );
  };

  return (
    <div className="bg-card border border-border rounded-2xl shadow-card overflow-hidden">
      {/* Card header */}
      <div className="flex items-start gap-4 p-4">
        <ProgressRing pct={objective.progress} confidence={objective.confidence} size={56} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-sm leading-snug">{objective.title}</h3>
            <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0", cfg.bg, cfg.color)}>
              <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", cfg.dot)} />
              {cfg.label}
            </span>
          </div>

          {objective.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{objective.description}</p>
          )}

          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {objective.owner && (
              <span className="flex items-center gap-1">
                <Avatar name={objective.owner.full_name || objective.owner.email} size="xs" />
                {objective.owner.full_name || objective.owner.email}
              </span>
            )}
            <span className="uppercase font-semibold">{objective.time_period}</span>
            <span>{objective.key_results?.length || 0} key results</span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
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
              workspaceSlug={workspaceSlug}
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
              <Button type="submit" size="sm" disabled={!krTitle.trim() || createKR.isPending}>
                Add
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingKR(false)}>
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
  const min    = Math.min(...values);
  const max    = Math.max(...values) || 1;
  const pts    = values.map((v, i) => {
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
export default function GoalsPage() {
  const { workspaceSlug } = useParams();
  const [timePeriod, setTimePeriod] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", time_period: "q1" });

  const { data: objectives = [], isLoading } = useObjectives(workspaceSlug, timePeriod);
  const { data: members = [] }               = useMembers(workspaceSlug);
  const createObjective                       = useCreateObjective(workspaceSlug);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    createObjective.mutate(form, { onSuccess: () => { setForm({ title: "", description: "", time_period: "q1" }); setCreateOpen(false); } });
  };

  const totalKRs      = objectives.flatMap((o) => o.key_results || []).length;
  const onTrackCount  = objectives.filter((o) => o.confidence === "on_track").length;
  const avgProgress   = objectives.length
    ? Math.round(objectives.reduce((s, o) => s + o.progress, 0) / objectives.length)
    : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0 bg-card/50">
        <div className="flex items-center gap-3">
          <Target className="w-5 h-5 text-muted-foreground" />
          <h1 className="font-bold text-base">Goals</h1>
        </div>

        <div className="flex items-center gap-2">
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
      {objectives.length > 0 && (
        <div className="flex items-center gap-6 px-6 py-3 border-b bg-muted/20 flex-shrink-0 text-sm">
          <div>
            <span className="text-muted-foreground">Objectives: </span>
            <span className="font-semibold">{objectives.length}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Key Results: </span>
            <span className="font-semibold">{totalKRs}</span>
          </div>
          <div>
            <span className="text-muted-foreground">On Track: </span>
            <span className="font-semibold text-emerald-600">{onTrackCount}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Avg Progress: </span>
            <span className="font-semibold">{avgProgress}%</span>
          </div>
        </div>
      )}

      {/* Objective list */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : objectives.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
            <div className="w-14 h-14 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
              <Target className="w-7 h-7" />
            </div>
            <div>
              <p className="font-semibold mb-1">No objectives yet</p>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Define clear goals and measure progress with key results.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-1.5" /> Create your first objective
            </Button>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {objectives.map((obj) => (
              <ObjectiveCard key={obj.id} objective={obj} workspaceSlug={workspaceSlug} />
            ))}
          </div>
        )}
      </div>

      {/* Create objective modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setCreateOpen(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> New Objective
              </h2>
              <button onClick={() => setCreateOpen(false)} className="p-1 rounded text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Title</label>
                <input
                  autoFocus
                  required
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="e.g. Grow MRR to $100k"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Description (optional)</label>
                <textarea
                  rows={2}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                  placeholder="What does success look like?"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Time Period</label>
                <div className="flex gap-1.5 flex-wrap">
                  {TIME_PERIODS.filter((p) => p.value !== "all").map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, time_period: p.value }))}
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

              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={!form.title.trim() || createObjective.isPending} className="flex-1">
                  {createObjective.isPending ? "Creating…" : "Create Objective"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
