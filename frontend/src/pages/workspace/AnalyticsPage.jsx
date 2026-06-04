import { useParams } from "react-router-dom";
import { useAnalytics } from "@/hooks/useAnalytics";
import { BarChart2, Users, CheckSquare, FolderKanban, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRIORITIES } from "@/lib/constants";

const PRIORITY_CONFIG = Object.fromEntries(PRIORITIES.map(p => [p.value, { label: p.label, color: p.hex }]));

function HorizontalBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-24 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color || "hsl(var(--primary))" }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

function SparkLine({ data }) {
  if (!data || data.length < 2) {
    return <div className="h-20 flex items-center justify-center text-xs text-muted-foreground">Not enough data yet</div>;
  }
  const counts  = data.map((d) => d.count);
  const max     = Math.max(...counts, 1);
  const w = 400;
  const h = 80;
  const step = w / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * step;
    const y = h - (d.count / max) * (h - 10);
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={i * step}
          cy={h - (d.count / max) * (h - 10)}
          r="3"
          fill="hsl(var(--primary))"
        />
      ))}
    </svg>
  );
}

export default function AnalyticsPage() {
  const { workspaceSlug } = useParams();
  const { data, isLoading } = useAnalytics(workspaceSlug);

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-64">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  const overview = data?.overview || {};
  const maxStatus   = Math.max(...(data?.tasks_by_status   || []).map((s) => s.count), 1);
  const maxPriority = Math.max(...(data?.tasks_by_priority || []).map((p) => p.count), 1);
  const maxWorkload = Math.max(...(data?.workload          || []).map((w) => w.assigned), 1);

  const overviewCards = [
    { label: "Projects",  value: overview.projects,  icon: FolderKanban, color: "text-indigo-600",  bg: "bg-indigo-50" },
    { label: "Tasks",     value: overview.tasks,     icon: CheckSquare,  color: "text-violet-600",  bg: "bg-violet-50" },
    { label: "Members",   value: overview.members,   icon: Users,        color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Open Tasks", value: overview.open_tasks, icon: BarChart2,  color: "text-orange-600",  bg: "bg-orange-50" },
  ];

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Workspace-wide insights across all projects.
        </p>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0", card.bg)}>
                <Icon className={cn("w-5 h-5", card.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight">{card.value ?? 0}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tasks by status */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Tasks by Status</p>
          {data?.tasks_by_status?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No data yet</p>
          ) : (
            <div className="space-y-2.5">
              {data?.tasks_by_status?.map((s) => (
                <HorizontalBar
                  key={s.status__name}
                  label={s.status__name || "No status"}
                  value={s.count}
                  max={maxStatus}
                  color={s.status__color}
                />
              ))}
            </div>
          )}
        </div>

        {/* Tasks by priority */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Tasks by Priority</p>
          {data?.tasks_by_priority?.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No data yet</p>
          ) : (
            <div className="space-y-2.5">
              {data?.tasks_by_priority?.map((p) => {
                const cfg = PRIORITY_CONFIG[p.priority] || PRIORITY_CONFIG.no_priority;
                return (
                  <HorizontalBar
                    key={p.priority}
                    label={cfg.label}
                    value={p.count}
                    max={maxPriority}
                    color={cfg.color}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Workload */}
        <div className="rounded-lg border bg-card p-5">
          <p className="text-sm font-semibold mb-4">Workload by Member</p>
          {data?.workload?.filter((w) => w.assigned > 0).length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No assigned tasks yet</p>
          ) : (
            <div className="space-y-2.5">
              {data?.workload?.filter((w) => w.assigned > 0).map((w) => (
                <HorizontalBar
                  key={w.email}
                  label={w.name}
                  value={w.assigned}
                  max={maxWorkload}
                />
              ))}
            </div>
          )}
        </div>

        {/* Completion trend */}
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Activity — Last 30 Days</p>
          </div>
          <SparkLine data={data?.completion_trend} />
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Status changes per day
          </p>
        </div>
      </div>
    </div>
  );
}
