import { useMemo, useState } from "react";
import { ShieldAlert, Clock, Users, LayoutGrid } from "lucide-react";
import { useAggregate } from "@/shared/hooks/useAnalyticsV2";
import ChartCard from "@/shared/components/charts/ChartCard";
import DistributionDonut from "@/shared/components/charts/DistributionDonut";
import BarChart from "@/shared/components/charts/BarChart";
import { getChartColor } from "@/shared/components/charts/chartPalette";
import { getPriority, getTaskType } from "@/shared/lib/constants";
import { TaskDrilldownModal } from "./TaskDrilldownTable";

function rangeDays(startDate, endDate) {
  if (!startDate || !endDate) return 30;
  const d =
    Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return Math.max(d, 1);
}

function aggregateToDonut(data) {
  if (!data?.results?.length) return null;
  const total = data.results.reduce((s, r) => s + r.value, 0);
  return {
    total,
    slices: data.results
      .filter((r) => r.value > 0)
      .map((r, i) => ({
        key: r.key,
        name: r.label,
        value: r.value,
        color: r.color || getChartColor(i),
      })),
  };
}

function aggregateToBar(data, getColor) {
  if (!data?.results?.length) return null;
  return {
    series: [{ name: "Tasks", data: data.results.map((r) => r.value) }],
    categories: data.results.map((r) => r.label),
    keys: data.results.map((r) => r.key),
    colors: data.results.map((r) => getColor?.(r.key) || getChartColor(0)),
  };
}

// ── Team workload list ────────────────────────────────────────────────────────

function WorkloadList({ results, onRowClick }) {
  if (!results?.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No assigned tasks
      </p>
    );
  }

  const total = results.reduce((s, r) => s + r.value, 0);
  const max = Math.max(...results.map((r) => r.value), 1);

  return (
    <div>
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 pb-2 border-b border-border">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
          Assignee
        </span>
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide w-[200px]">
          Work distribution
        </span>
      </div>

      <div className="divide-y divide-border">
        {results.map((r, i) => {
          const pct =
            total > 0 ? Math.round((r.value / total) * 100) : 0;
          const barWidth = Math.round((r.value / max) * 100);
          const initials = (r.label || "?")
            .split(" ")
            .map((w) => w[0])
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const color = getChartColor(i);

          return (
            <div
              key={r.key || i}
              onClick={() => onRowClick?.(r)}
              className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5 hover:bg-muted/40 cursor-pointer transition-colors"
            >
              {/* Avatar + name */}
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
                <span className="text-[12px] text-foreground font-medium truncate">
                  {r.label}
                </span>
              </div>

              {/* % + progress bar */}
              <div className="flex items-center gap-2 w-[200px]">
                <span className="text-[11px] font-bold text-muted-foreground tabular-nums w-8 text-right shrink-0">
                  {pct}%
                </span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: color,
                      opacity: 0.75,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground",
  loading,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 flex-1 min-w-[140px] text-left transition-colors ${
        onClick ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"
      }`}
    >
      <div className={`p-2 rounded-lg bg-muted/60 ${color}`}>
        <Icon size={15} />
      </div>
      <div>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        {loading ? (
          <div className="h-5 w-8 bg-muted animate-pulse rounded mt-0.5" />
        ) : (
          <p className="text-lg font-bold text-foreground tabular-nums leading-none mt-0.5">
            {value ?? "—"}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Board Tab ─────────────────────────────────────────────────────────────────

export default function BoardTab({ workspaceId, startDate, endDate, filterParams = {} }) {
  const days = useMemo(
    () => rangeDays(startDate, endDate),
    [startDate, endDate],
  );

  const [drill, setDrill] = useState(null);
  const openDrill = (title, extraParams) =>
    setDrill({ title, params: { ...filterParams, ...extraParams } });

  const { data, isLoading } = useAggregate(workspaceId, {
    params: {
      group_by: "status,priority,type,assignee",
      page_size: 30,
      stale_days: days,
      ...filterParams,
    },
  });

  const summary = data?.summary;
  const statusGroup = data?.groups?.status;
  const priorityGroup = data?.groups?.priority;
  const typeGroup = data?.groups?.type;
  const assigneeGroup = data?.groups?.assignee;

  const statusDonut = useMemo(() => aggregateToDonut(statusGroup), [statusGroup]);
  const priorityBar = useMemo(
    () => aggregateToBar(priorityGroup, (key) => getPriority(key)?.hex),
    [priorityGroup],
  );
  const typeBar = useMemo(
    () => aggregateToBar(typeGroup, (key) => getTaskType(key)?.hex),
    [typeGroup],
  );

  const totalTasks = summary?.total ?? 0;
  const openTasks = summary?.open ?? 0;
  const blockedCount = summary?.blocked ?? 0;
  const staleCount = summary?.stale ?? 0;

  return (
    <div className="space-y-5">
      {/* ── Stat pills ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <StatPill
          icon={LayoutGrid}
          label="Total Tasks"
          value={totalTasks}
          loading={isLoading}
        />
        <StatPill
          icon={Users}
          label="Open Tasks"
          value={openTasks}
          loading={isLoading}
          onClick={() => openDrill("Open tasks", { open: "true" })}
        />
        <StatPill
          icon={ShieldAlert}
          label="Blocked"
          value={blockedCount}
          loading={isLoading}
          color="text-red-500"
          onClick={() => openDrill("Blocked tasks", { blocked: "true" })}
        />
        <StatPill
          icon={Clock}
          label={`Stale >${days}d`}
          value={staleCount}
          loading={isLoading}
          color="text-amber-500"
          onClick={() =>
            openDrill(`Stale (open >${days}d)`, {
              created_before: `${days}d`,
              open: "true",
            })
          }
        />
      </div>

      {/* ── Status: donut + side legend inline ──────────────────────────────── */}
      <ChartCard
        title="Status overview"
        subtitle="Get a snapshot of the status of your work items — click a slice to see those tasks"
        loading={isLoading}
        empty={!isLoading && !statusDonut}
        emptyText="No tasks yet"
        skeletonType="donut"
        skeletonHeight={260}
      >
        <DistributionDonut
          data={statusDonut}
          height={260}
          onSliceClick={(s) => openDrill(`Status: ${s.name}`, { status: s.key })}
        />
      </ChartCard>

      {/* ── Priority + Types side by side ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChartCard
          title="Priority breakdown"
          subtitle="Get a holistic view of how work is being prioritized"
          loading={isLoading}
          empty={!isLoading && !priorityBar}
          emptyText="No tasks yet"
          skeletonType="bar"
          skeletonHeight={240}
        >
          {priorityBar && (
            <BarChart
              series={priorityBar.series}
              categories={priorityBar.categories}
              height={240}
              showLegend={false}
              barColors={(_, i) => priorityBar.colors[i]}
              onBarClick={(i) =>
                openDrill(`Priority: ${priorityBar.categories[i]}`, {
                  priority: priorityBar.keys[i],
                })
              }
            />
          )}
        </ChartCard>

        <ChartCard
          title="Types of work"
          subtitle="A breakdown of work items by their types"
          loading={isLoading}
          empty={!isLoading && !typeBar}
          emptyText="No tasks yet"
          skeletonType="bar"
          skeletonHeight={240}
        >
          {typeBar && (
            <BarChart
              series={typeBar.series}
              categories={typeBar.categories}
              height={240}
              horizontal
              showLegend={false}
              barColors={(_, i) => typeBar.colors[i]}
              onBarClick={(i) =>
                openDrill(`Type: ${typeBar.categories[i]}`, {
                  type: typeBar.keys[i],
                })
              }
            />
          )}
        </ChartCard>
      </div>

      {/* ── Team workload ────────────────────────────────────────────────────── */}
      <ChartCard
        title="Team workload"
        subtitle="Monitor the capacity of your team — click a row to see their tasks"
        loading={isLoading}
        empty={!isLoading && !assigneeGroup?.results?.length}
        emptyText="No assigned tasks"
        skeletonType="bar"
        skeletonHeight={220}
      >
        <WorkloadList
          results={assigneeGroup?.results}
          onRowClick={(r) =>
            openDrill(`${r.label}'s tasks`, { assignee: r.key })
          }
        />
      </ChartCard>

      <TaskDrilldownModal
        open={!!drill}
        onClose={() => setDrill(null)}
        workspaceId={workspaceId}
        title={drill?.title || "Tasks"}
        params={drill?.params || {}}
      />
    </div>
  );
}
