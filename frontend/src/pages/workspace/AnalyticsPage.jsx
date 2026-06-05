import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  BarChart2, RefreshCw, ChevronDown, FileBarChart,
  TrendingUp, Activity, Users, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  useVelocity, useCycleTime, useLeadTime,
  useThroughput, useCFD, useBurnup, useWorkloadHeatmap,
} from "@/hooks/useAnalyticsV2";
import { useProjects } from "@/hooks/useProjects";
import { useSprints } from "@/hooks/useSprints";
import { PRIORITIES } from "@/lib/constants";
import VelocityChart    from "@/components/charts/VelocityChart";
import CFDChart         from "@/components/charts/CFDChart";
import CycleTimeChart   from "@/components/charts/CycleTimeChart";
import LeadTimeChart    from "@/components/charts/LeadTimeChart";
import ThroughputChart  from "@/components/charts/ThroughputChart";
import BurnupChart      from "@/components/charts/BurnupChart";
import WorkloadHeatmap  from "@/components/charts/WorkloadHeatmap";

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "overview",   label: "Overview",   icon: BarChart2   },
  { id: "velocity",   label: "Velocity",   icon: TrendingUp  },
  { id: "flow",       label: "Flow",       icon: Activity    },
  { id: "team",       label: "Team",       icon: Users       },
  { id: "reports",    label: "Reports →",  icon: FileBarChart, external: true },
];

// ── Filters bar ───────────────────────────────────────────────────────────────
function Select({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Mini stat card ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = "bg-primary/10 text-primary", icon: Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card flex items-start gap-3">
      {Icon && (
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", color)}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <p className="text-2xl font-bold tabular-nums">{value ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Horizontal bar (overview) ─────────────────────────────────────────────────
function HBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color || "hsl(var(--primary))" }} />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

const PRI_COLOR = Object.fromEntries(PRIORITIES.map((p) => [p.value, { label: p.label, color: p.hex }]));

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ workspaceSlug, projectId }) {
  const { data, isLoading } = useAnalytics(workspaceSlug);
  const ov  = data?.overview || {};
  const maxS = Math.max(1, ...(data?.tasks_by_status   || []).map((s) => s.count));
  const maxP = Math.max(1, ...(data?.tasks_by_priority || []).map((p) => p.count));
  const maxW = Math.max(1, ...(data?.workload          || []).filter((w) => w.assigned > 0).map((w) => w.assigned));

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Projects"   value={ov.projects}   icon={Layers}   color="bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300" />
        <StatCard label="Tasks"      value={ov.tasks}      icon={BarChart2} color="bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300" />
        <StatCard label="Members"    value={ov.members}    icon={Users}    color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" />
        <StatCard label="Open Tasks" value={ov.open_tasks} icon={Activity} color="bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-sm font-semibold mb-4">Tasks by Status</p>
          {(data?.tasks_by_status || []).length === 0
            ? <p className="text-xs text-muted-foreground py-6 text-center">No data yet</p>
            : <div className="space-y-2.5">
                {(data?.tasks_by_status || []).map((s) => (
                  <HBar key={s.status__name} label={s.status__name || "None"} value={s.count} max={maxS} color={s.status__color} />
                ))}
              </div>
          }
        </div>

        {/* Priority */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-sm font-semibold mb-4">Tasks by Priority</p>
          {(data?.tasks_by_priority || []).length === 0
            ? <p className="text-xs text-muted-foreground py-6 text-center">No data yet</p>
            : <div className="space-y-2.5">
                {(data?.tasks_by_priority || []).map((p) => {
                  const cfg = PRI_COLOR[p.priority] || PRI_COLOR.no_priority;
                  return <HBar key={p.priority} label={cfg?.label || p.priority} value={p.count} max={maxP} color={cfg?.color} />;
                })}
              </div>
          }
        </div>

        {/* Workload */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-sm font-semibold mb-4">Workload by Member</p>
          {(data?.workload || []).filter((w) => w.assigned > 0).length === 0
            ? <p className="text-xs text-muted-foreground py-6 text-center">No assigned tasks yet</p>
            : <div className="space-y-2.5">
                {(data?.workload || []).filter((w) => w.assigned > 0).map((w) => (
                  <HBar key={w.email} label={w.name || w.email} value={w.assigned} max={maxW} />
                ))}
              </div>
          }
        </div>

        {/* Trend sparkline */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-card">
          <p className="text-sm font-semibold mb-3">Activity — Last 30 Days</p>
          <CompletionSparkline data={data?.completion_trend} />
        </div>
      </div>
    </div>
  );
}

function CompletionSparkline({ data }) {
  if (!data || data.length < 2)
    return <p className="text-xs text-muted-foreground text-center py-8">Not enough data yet</p>;
  const counts = data.map((d) => d.count);
  const max = Math.max(...counts, 1);
  const W = 400, H = 80;
  const step = W / (data.length - 1);
  const points = data.map((d, i) => `${i * step},${H - (d.count / max) * (H - 10)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle key={i} cx={i * step} cy={H - (d.count / max) * (H - 10)} r="3" fill="hsl(var(--primary))" />
      ))}
    </svg>
  );
}

// ── Velocity tab ──────────────────────────────────────────────────────────────
function VelocityTab({ workspaceSlug, projectId }) {
  const [period, setPeriod] = useState("week");
  const [days,   setDays]   = useState(90);

  const { data: vData, isLoading: vLoad } = useVelocity(workspaceSlug, { projectId });
  const { data: tData, isLoading: tLoad } = useThroughput(workspaceSlug, { projectId, period, days });
  const { data: bData, isLoading: bLoad } = useBurnup(workspaceSlug, { projectId, days: 30 });

  return (
    <div className="space-y-4">
      <VelocityChart data={vData} avgSP={vData?.avg_story_points} loading={vLoad} />

      <div className="flex items-center gap-3">
        <Select
          value={period}
          onChange={(v) => setPeriod(v || "week")}
          options={[
            { value: "day",   label: "Daily" },
            { value: "week",  label: "Weekly" },
            { value: "month", label: "Monthly" },
          ]}
        />
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v) || 90)}
          options={[
            { value: "30",  label: "Last 30 days" },
            { value: "60",  label: "Last 60 days" },
            { value: "90",  label: "Last 90 days" },
            { value: "180", label: "Last 180 days" },
          ]}
        />
      </div>

      <ThroughputChart data={tData} period={period} loading={tLoad} />
      {projectId && <BurnupChart data={bData} loading={bLoad} />}
    </div>
  );
}

// ── Flow tab ──────────────────────────────────────────────────────────────────
function FlowTab({ workspaceSlug, projectId }) {
  const [cfdDays, setCfdDays] = useState(30);
  const [ltDays,  setLtDays]  = useState(90);
  const [ctDays,  setCtDays]  = useState(90);

  const { data: cfdData, isLoading: cfdLoad } = useCFD(workspaceSlug, { projectId, days: cfdDays });
  const { data: ltData,  isLoading: ltLoad  } = useLeadTime(workspaceSlug, { projectId, days: ltDays });
  const { data: ctData,  isLoading: ctLoad  } = useCycleTime(workspaceSlug, { projectId, days: ctDays });

  const dayOptions = [
    { value: "14",  label: "Last 14 days" },
    { value: "30",  label: "Last 30 days" },
    { value: "60",  label: "Last 60 days" },
    { value: "90",  label: "Last 90 days" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">CFD window:</span>
        <Select value={String(cfdDays)} onChange={(v) => setCfdDays(Number(v))} options={dayOptions} />
      </div>
      <CFDChart data={cfdData} loading={cfdLoad} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Lead time window:</span>
            <Select value={String(ltDays)} onChange={(v) => setLtDays(Number(v))} options={dayOptions.slice(1)} />
          </div>
          <LeadTimeChart data={ltData} loading={ltLoad} />
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-muted-foreground">Cycle time window:</span>
            <Select value={String(ctDays)} onChange={(v) => setCtDays(Number(v))} options={dayOptions.slice(1)} />
          </div>
          <CycleTimeChart data={ctData} loading={ctLoad} />
        </div>
      </div>
    </div>
  );
}

// ── Team tab ──────────────────────────────────────────────────────────────────
function TeamTab({ workspaceSlug, projectId }) {
  const [hmDays, setHmDays] = useState(14);

  const { data: hmData, isLoading: hmLoad } = useWorkloadHeatmap(workspaceSlug, { projectId, days: hmDays });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Window:</span>
        <Select
          value={String(hmDays)}
          onChange={(v) => setHmDays(Number(v))}
          options={[
            { value: "7",  label: "Last 7 days" },
            { value: "14", label: "Last 14 days" },
            { value: "21", label: "Last 21 days" },
            { value: "30", label: "Last 30 days" },
          ]}
        />
      </div>
      <WorkloadHeatmap data={hmData} loading={hmLoad} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { workspaceSlug } = useParams();
  const [activeTab,  setActiveTab]  = useState("overview");
  const [projectId,  setProjectId]  = useState(undefined);

  const { data: projects = [] } = useProjects(workspaceSlug);

  const projectOptions = [
    { value: "", label: "All projects" },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];

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
            <p className="text-xs text-muted-foreground mt-0.5">Insights across your workspace</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Project filter */}
            <Select
              value={projectId || ""}
              onChange={(v) => setProjectId(v || undefined)}
              options={projectOptions}
            />
            <Link
              to={`/w/${workspaceSlug}/reports`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              <FileBarChart className="w-3.5 h-3.5" />
              Reports
            </Link>
          </div>
        </div>

        {/* Tab strip */}
        <div className="flex gap-0 mt-3 -mb-4 overflow-x-auto">
          {TABS.filter((t) => t.id !== "reports").map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === "overview" && <OverviewTab  workspaceSlug={workspaceSlug} projectId={projectId} />}
        {activeTab === "velocity" && <VelocityTab  workspaceSlug={workspaceSlug} projectId={projectId} />}
        {activeTab === "flow"     && <FlowTab      workspaceSlug={workspaceSlug} projectId={projectId} />}
        {activeTab === "team"     && <TeamTab      workspaceSlug={workspaceSlug} projectId={projectId} />}
      </div>
    </div>
  );
}
