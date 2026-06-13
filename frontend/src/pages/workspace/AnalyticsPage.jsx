import { useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart2, Activity, Users, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  useVelocity,
  useCycleTime,
  useLeadTime,
  useThroughput,
  useCFD,
  useBurnup,
  useWorkloadHeatmap,
} from "@/hooks/useAnalyticsV2";
import { useProjects } from "@/hooks/useProjects";
import { PRIORITIES } from "@/lib/constants";
import VelocityChart from "@/components/charts/VelocityChart";
import CFDChart from "@/components/charts/CFDChart";
import CycleTimeChart from "@/components/charts/CycleTimeChart";
import LeadTimeChart from "@/components/charts/LeadTimeChart";
import ThroughputChart from "@/components/charts/ThroughputChart";
import BurnupChart from "@/components/charts/BurnupChart";
import WorkloadHeatmap from "@/components/charts/WorkloadHeatmap";

// ── Shared primitives ─────────────────────────────────────────────────────────

const PRI_COLOR = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, { label: p.label, color: p.hex }]),
);

function StatCard({ label, value, color = "bg-primary/10 text-primary", icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-md p-4 shadow-card flex items-start gap-3">
      {Icon && (
        <div className={cn("w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0", color)}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <p className="text-2xl font-bold tabular-nums">{value ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function HBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 truncate flex-shrink-0 text-right">
        {label}
      </span>
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

function Card({ title, children, className }) {
  return (
    <div className={cn("bg-card border border-border rounded-md p-5 shadow-card", className)}>
      {title && <p className="text-sm font-semibold mb-4">{title}</p>}
      {children}
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
        {label}
      </p>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function CompletionSparkline({ data }) {
  if (!data || data.length < 2)
    return (
      <p className="text-xs text-muted-foreground text-center py-8">Not enough data yet</p>
    );
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const W = 400, H = 80;
  const step = W / (data.length - 1);
  const points = data
    .map((d, i) => `${i * step},${H - (d.count / max) * (H - 10)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
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
          cy={H - (d.count / max) * (H - 10)}
          r="3"
          fill="hsl(var(--primary))"
        />
      ))}
    </svg>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────
// Each section receives: workspaceSlug, projectId, days

function KpiSection({ workspaceSlug }) {
  const { data } = useAnalytics(workspaceSlug);
  const ov = data?.overview || {};
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard
        label="Projects"
        value={ov.projects}
        icon={Layers}
        color="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
      />
      <StatCard
        label="Total Tasks"
        value={ov.tasks}
        icon={BarChart2}
        color="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300"
      />
      <StatCard
        label="Members"
        value={ov.members}
        icon={Users}
        color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <StatCard
        label="Open Tasks"
        value={ov.open_tasks}
        icon={Activity}
        color="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300"
      />
    </div>
  );
}

function TaskBreakdownSection({ workspaceSlug }) {
  const { data } = useAnalytics(workspaceSlug);
  const maxS = Math.max(1, ...(data?.tasks_by_status || []).map((s) => s.count));
  const maxP = Math.max(1, ...(data?.tasks_by_priority || []).map((p) => p.count));
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Tasks by Status">
        {(data?.tasks_by_status || []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No data yet</p>
        ) : (
          <div className="space-y-2.5">
            {(data?.tasks_by_status || []).map((s) => (
              <HBar
                key={s.status__name}
                label={s.status__name || "None"}
                value={s.count}
                max={maxS}
                color={s.status__color}
              />
            ))}
          </div>
        )}
      </Card>
      <Card title="Tasks by Priority">
        {(data?.tasks_by_priority || []).length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">No data yet</p>
        ) : (
          <div className="space-y-2.5">
            {(data?.tasks_by_priority || []).map((p) => {
              const cfg = PRI_COLOR[p.priority] || PRI_COLOR.no_priority;
              return (
                <HBar
                  key={p.priority}
                  label={cfg?.label || p.priority}
                  value={p.count}
                  max={maxP}
                  color={cfg?.color}
                />
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

function ActivitySection({ workspaceSlug }) {
  const { data } = useAnalytics(workspaceSlug);
  return (
    <Card title="Activity — Last 30 Days">
      <CompletionSparkline data={data?.completion_trend} />
    </Card>
  );
}

function WorkloadSection({ workspaceSlug }) {
  const { data } = useAnalytics(workspaceSlug);
  const active = (data?.workload || []).filter((w) => w.assigned > 0);
  const maxW = Math.max(1, ...active.map((w) => w.assigned));
  return (
    <Card title="Workload by Member">
      {active.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No assigned tasks yet</p>
      ) : (
        <div className="space-y-2.5">
          {active.map((w) => (
            <HBar key={w.email} label={w.name || w.email} value={w.assigned} max={maxW} />
          ))}
        </div>
      )}
    </Card>
  );
}

function VelocitySection({ workspaceSlug, projectId, days }) {
  const { data: vData, isLoading: vLoad } = useVelocity(workspaceSlug, { projectId });
  const { data: tData, isLoading: tLoad } = useThroughput(workspaceSlug, {
    projectId,
    period: "week",
    days,
  });
  const { data: bData, isLoading: bLoad } = useBurnup(workspaceSlug, { projectId, days });
  return (
    <div className="space-y-4">
      <VelocityChart data={vData} avgSP={vData?.avg_story_points} loading={vLoad} />
      <ThroughputChart data={tData} period="week" loading={tLoad} />
      {projectId && <BurnupChart data={bData} loading={bLoad} />}
    </div>
  );
}

function FlowSection({ workspaceSlug, projectId, days }) {
  const { data: cfdData, isLoading: cfdLoad } = useCFD(workspaceSlug, { projectId, days });
  const { data: ltData, isLoading: ltLoad } = useLeadTime(workspaceSlug, { projectId, days });
  const { data: ctData, isLoading: ctLoad } = useCycleTime(workspaceSlug, { projectId, days });
  return (
    <div className="space-y-4">
      <CFDChart data={cfdData} loading={cfdLoad} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadTimeChart data={ltData} loading={ltLoad} />
        <CycleTimeChart data={ctData} loading={ctLoad} />
      </div>
    </div>
  );
}

function TeamSection({ workspaceSlug, projectId, days }) {
  const { data: hmData, isLoading: hmLoad } = useWorkloadHeatmap(workspaceSlug, {
    projectId,
    days,
  });
  return <WorkloadHeatmap data={hmData} loading={hmLoad} />;
}

// ── Section registry ──────────────────────────────────────────────────────────
// To add a new section: write a Component above, then add one entry here.
// Each Component receives: workspaceSlug, projectId, days
const SECTIONS = [
  { id: "kpis", Component: KpiSection },
  { id: "tasks", label: "Task Breakdown", Component: TaskBreakdownSection },
  { id: "activity", Component: ActivitySection },
  { id: "workload", Component: WorkloadSection },
  { id: "velocity", label: "Velocity & Throughput", Component: VelocitySection },
  { id: "flow", label: "Flow Metrics", Component: FlowSection },
  { id: "team", label: "Team Heatmap", Component: TeamSection },
];

const DATE_OPTIONS = [
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "60", label: "Last 60 days" },
  { value: "90", label: "Last 90 days" },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { workspaceSlug } = useParams();
  const [projectId, setProjectId] = useState(undefined);
  const [days, setDays] = useState(30);

  const { data: projects = [] } = useProjects(workspaceSlug);
  const sharedProps = { workspaceSlug, projectId, days };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-primary" />
              Analytics
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Insights across your workspace
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={projectId || ""}
              onChange={(e) => setProjectId(e.target.value || undefined)}
              className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
              className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
            >
              {DATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* All sections — single scrollable view */}
      <div className="flex-1 overflow-auto p-6 space-y-6">
        {SECTIONS.map(({ id, label, Component }) => (
          <div key={id} className="space-y-3">
            {label && <SectionDivider label={label} />}
            <Component {...sharedProps} />
          </div>
        ))}
      </div>
    </div>
  );
}
