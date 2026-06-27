import { useMemo, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { useAggregate } from "@/shared/hooks/useAnalyticsV2";
import ChartCard from "@/shared/components/charts/ChartCard";
import BarChart from "@/shared/components/charts/BarChart";
import { getChartColor } from "@/shared/components/charts/chartPalette";
import TaskDrilldownTable, { TaskDrilldownModal } from "./TaskDrilldownTable";

// The three lenses on the overdue backlog — one chart, switchable. Each maps to
// a group_by dimension + the drill-down filter key used when a bar is clicked.
const DIMENSIONS = [
  { key: "assignee", label: "By assignee", filterKey: "filter[assignee]" },
  { key: "priority", label: "By priority", filterKey: "filter[priority]" },
  { key: "board", label: "By board", filterKey: "filter[board]" },
];

function DimensionToggle({ value, onChange }) {
  return (
    <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
      {DIMENSIONS.map((d) => (
        <button
          key={d.key}
          onClick={() => onChange(d.key)}
          className={cn(
            "px-2 py-1 rounded-md text-[11px] font-medium transition-all",
            value === d.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

function OverdueBreakdown({ workspaceId, filterParams, onSegmentClick }) {
  const [dim, setDim] = useState("assignee");
  const active = DIMENSIONS.find((d) => d.key === dim);

  const { data, isLoading } = useAggregate(workspaceId, {
    params: { group_by: dim, "filter[overdue]": "true", ...filterParams },
  });

  const bar = useMemo(() => {
    if (!data?.results?.length) return null;
    const sorted = [...data.results].sort((a, b) => b.value - a.value);
    return {
      series: [{ name: "Overdue", data: sorted.map((r) => r.value) }],
      categories: sorted.map((r) => r.label),
      keys: sorted.map((r) => r.key),
    };
  }, [data]);

  return (
    <ChartCard
      title="Overdue breakdown"
      subtitle="Where the overdue work is piling up — click a bar to drill in"
      actions={<DimensionToggle value={dim} onChange={setDim} />}
      loading={isLoading}
      empty={!isLoading && !bar}
      emptyText="No overdue tasks 🎉"
      skeletonType="bar"
      skeletonHeight={320}
      className="h-full"
    >
      {bar && (
        <BarChart
          series={bar.series}
          categories={bar.categories}
          height={320}
          showLegend={false}
          barColors={() => "#ef4444"}
          onBarClick={(i) =>
            onSegmentClick({
              title: `Overdue — ${bar.categories[i]}`,
              params: { [active.filterKey]: bar.keys[i] },
            })
          }
        />
      )}
    </ChartCard>
  );
}

/**
 * Overdue tasks — past their due date and still open.
 *
 * Left: a switchable breakdown chart (by assignee / priority / board). Right:
 * the shared TaskDrilldownTable pointed at the `overdue` filter, ordered
 * most-overdue-first. Both honour the page filter bar via `filterParams`, and
 * every bar/row deep-links into the task. The headline count lives in the KPI
 * cards, so this section is purely the actionable list + where it's concentrated.
 */
export default function OverdueSection({ workspaceId, filterParams = {} }) {
  const [drill, setDrill] = useState(null);

  const tableParams = useMemo(
    () => ({ "filter[overdue]": "true", order: "due", ...filterParams }),
    [filterParams],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <div className="xl:col-span-1">
        <OverdueBreakdown
          workspaceId={workspaceId}
          filterParams={filterParams}
          onSegmentClick={setDrill}
        />
      </div>

      <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5 shadow-sm">
        <TaskDrilldownTable
          workspaceId={workspaceId}
          params={tableParams}
          showOverdue
          emptyText="No overdue tasks — great work!"
        />
      </div>

      <TaskDrilldownModal
        open={!!drill}
        onClose={() => setDrill(null)}
        workspaceId={workspaceId}
        title={drill?.title || "Overdue tasks"}
        params={{ "filter[overdue]": "true", ...filterParams, ...(drill?.params || {}) }}
        showOverdue
      />
    </div>
  );
}
