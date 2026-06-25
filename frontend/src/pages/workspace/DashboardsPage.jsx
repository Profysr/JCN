import { useParams, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  CircleCheckBig,
  Users,
  Gauge,
} from "lucide-react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/shared/lib/utils";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useBoards } from "@/apps/project-management/hooks/useProjects";
import { useObjectives, CONFIDENCE_CONFIG } from "@/shared/hooks/useGoals";
import { useVelocity, useThroughput } from "@/shared/hooks/useAnalyticsV2";
import GettingStartedChecklist from "@/apps/project-management/components/GettingStartedChecklist";

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="flex-1 min-w-[200px] bg-card border border-border rounded-md p-5 flex items-center gap-4 shadow-card">
      <div
        className={cn(
          "w-11 h-11 rounded-md flex items-center justify-center flex-shrink-0",
          color,
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-sm text-muted-foreground truncate">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/80">{sub}</p>}
      </div>
    </div>
  );
}

// ── OKR progress (the one working widget, baked in) ──────────────────────────
function OkrProgress({ workspaceId }) {
  const navigate = useNavigate();
  const { data: objectives = [] } = useObjectives(workspaceId);
  const top = objectives.slice(0, 4);

  return (
    <div className="bg-card border border-border rounded-md p-5 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">Goals & OKRs</h2>
        <button
          onClick={() => navigate(`/w/${workspaceId}/goals`)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all →
        </button>
      </div>

      {top.length === 0 ? (
        <button
          onClick={() => navigate(`/w/${workspaceId}/goals`)}
          className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-6 transition-colors"
        >
          No goals yet — create your first objective →
        </button>
      ) : (
        <div className="space-y-3.5">
          {top.map((obj) => {
            const cfg =
              CONFIDENCE_CONFIG[obj.confidence] || CONFIDENCE_CONFIG.on_track;
            return (
              <div key={obj.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate">
                    {obj.title}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2",
                      cfg.bg,
                      cfg.color,
                    )}
                  >
                    {obj.progress}%
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${obj.progress}%`,
                      backgroundColor:
                        obj.confidence === "on_track"
                          ? "#22c55e"
                          : obj.confidence === "at_risk"
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Throughput — tasks completed per week (real analytics) ───────────────────
function weekLabel(period) {
  const d = new Date(period);
  return isNaN(d) ? period : format(d, "MMM d");
}

function ThroughputCard({ workspaceId }) {
  const { data: throughput = [] } = useThroughput(workspaceId, {
    period: "week",
    days: 84,
  });
  const recent = throughput.slice(-8);
  const max = Math.max(1, ...recent.map((r) => r.count));
  const total = recent.reduce((s, r) => s + r.count, 0);

  // week-over-week delta on the two most recent buckets
  const last = recent[recent.length - 1]?.count ?? 0;
  const prev = recent[recent.length - 2]?.count ?? 0;
  const delta = last - prev;
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const trendTone =
    delta > 0
      ? "text-emerald-600"
      : delta < 0
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <div className="bg-card border border-border rounded-md p-5 shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">Throughput</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tasks completed per week
          </p>
        </div>
        {recent.length > 0 && (
          <div className="text-right">
            <p className="text-xl font-bold leading-none tabular-nums">
              {total}
            </p>
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-[11px] font-medium mt-1",
                trendTone,
              )}
            >
              <TrendIcon className="w-3 h-3" />
              {delta === 0 ? "no change" : `${Math.abs(delta)} vs last wk`}
            </span>
          </div>
        )}
      </div>

      {recent.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">
          No completed tasks yet
        </p>
      ) : (
        <div className="flex items-end gap-2 h-32 border-b border-border/70">
          {recent.map((r) => {
            const pct = (r.count / max) * 100;
            return (
              <div
                key={r.period}
                className="group flex-1 h-full flex flex-col justify-end items-center gap-1.5"
                title={`Week of ${weekLabel(r.period)}: ${r.count} tasks`}
              >
                <span className="text-[10px] font-medium text-muted-foreground tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                  {r.count}
                </span>
                {/* track + bar */}
                <div className="w-full max-w-[34px] flex-1 flex items-end rounded-t bg-muted/40">
                  <div
                    className="w-full rounded-t bg-primary group-hover:bg-primary/80 transition-all"
                    style={{ height: `${Math.max(pct, r.count > 0 ? 6 : 0)}%` }}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                  {weekLabel(r.period)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────
export default function DashboardsPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();

  const { data: boards = [] } = useBoards(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: velocity } = useVelocity(workspaceId);

  const totalTasks = boards.reduce((s, p) => s + (p.task_count || 0), 0);
  const doneTasks = boards.reduce((s, p) => s + (p.done_task_count || 0), 0);
  const completionPct =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const stats = [
    {
      label: "Boards",
      value: boards.length,
      icon: FolderKanban,
      color:
        "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    },
    {
      label: "Tasks",
      value: totalTasks,
      icon: ListChecks,
      color:
        "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    },
    {
      label: "Completed",
      value: doneTasks,
      sub: `${completionPct}% of all tasks`,
      icon: CircleCheckBig,
      color:
        "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    },
    {
      label: "Members",
      value: workspace?.member_count || 0,
      icon: Users,
      color:
        "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    },
    {
      label: "Avg velocity",
      value: velocity?.avg_tasks_completed ?? 0,
      sub: "tasks / sprint",
      icon: Gauge,
      color: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex items-center gap-2 flex-shrink-0">
        <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>

      <div className="p-6 space-y-6">
        <GettingStartedChecklist workspaceId={workspaceId} />

        {/* Stat cards */}
        <div className="flex flex-wrap gap-4">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>

        {/* Analytics row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ThroughputCard workspaceId={workspaceId} />
          <OkrProgress workspaceId={workspaceId} />
        </div>

        {/* Recent boards */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Boards
          </h2>
          {boards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No boards yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {boards.slice(0, 6).map((p) => {
                const done = p.done_task_count || 0;
                const total = p.task_count || 0;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/w/${workspaceId}/boards/${p.id}`)}
                    className="text-left bg-card border border-border rounded-md p-4 shadow-card hover:shadow-card-hover transition-shadow"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <BoardTypeIcon board_type={p.board_type} size="md" />
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {total} task{total !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 text-right">
                      {pct}% complete
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
