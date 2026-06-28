import { useEffect, useMemo, useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/components/ui/avatar";
import { useTeamWorkload } from "@/shared/hooks/useAnalyticsV2";
import BarChart from "@/shared/components/charts/BarChart";
import { TaskDrilldownModal } from "./TaskDrilldownTable";

// ── 1. HELPERS & UTILITIES ──────────────────────────────────────────────────

function rangeDays(startDate, endDate) {
  if (!startDate || !endDate) return 14;
  const d =
    Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  return Math.min(Math.max(d, 1), 30);
}

function getStripColorClass(v) {
  if (!v || v === 0) return "bg-primary";
  if (v > 5) return v >= 8 ? "bg-red-800" : "bg-red-600";
  if (v >= 2) return v >= 4 ? "bg-orange-600" : "bg-orange-500";
  return "bg-amber-400";
}

function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d)
    ? iso
    : d.toLocaleDateString("default", { day: "numeric", month: "long" });
}

const SORTS = {
  name: (a, b) =>
    (a.user?.full_name || "").localeCompare(b.user?.full_name || ""),
  assigned: (a, b) => a.assigned - b.assigned,
  open: (a, b) => a.open - b.open,
  overdue: (a, b) => a.overdue - b.overdue,
  completed: (a, b) => a.completed - b.completed,
  points: (a, b) => a.points - b.points,
};

// ── 2. SUB-COMPONENTS ────────────────────────────────────────────────────────

function WorkloadHeader({ days }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <p className="text-sm font-semibold">Delivery Breakdown</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Open, overdue and completed tasks per member — plus a {days}-day
          due-date heatmap. Click a member to see their tasks.
        </p>
      </div>
    </div>
  );
}

function WorkloadSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="h-10 bg-muted animate-pulse rounded"
          style={{ opacity: 0.35 + i * 0.05, animationDelay: `${i * 50}ms` }}
        />
      ))}
    </div>
  );
}

function SortIcon({ col, sortKey, dir }) {
  if (sortKey !== col)
    return (
      <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40 inline ml-1" />
    );
  return dir === "asc" ? (
    <ChevronUp className="w-3 h-3 text-primary inline ml-1" />
  ) : (
    <ChevronDown className="w-3 h-3 text-primary inline ml-1" />
  );
}

function Th({ col, sortKey, dir, onSort, children, className }) {
  return (
    <th
      className={cn(
        "py-2.5 px-3 text-[11px] font-semibold text-muted-foreground whitespace-nowrap select-none text-center vertical-middle",
        col && "cursor-pointer hover:text-foreground transition-colors",
        className,
      )}
      onClick={col ? () => onSort(col) : undefined}
    >
      <div className="inline-flex items-center justify-center gap-0.5">
        {children}
        {col && <SortIcon col={col} sortKey={sortKey} dir={dir} />}
      </div>
    </th>
  );
}

function TableHeader({ sortKey, dir, onSort, days }) {
  return (
    <thead className="bg-muted/50 border-b border-border">
      <tr>
        <th
          className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-left sticky left-0 bg-muted z-20 border-r border-border/30 cursor-pointer hover:text-foreground transition-colors"
          onClick={() => onSort("name")}
        >
          <div className="flex items-center gap-0.5">
            Member
            <SortIcon col="name" sortKey={sortKey} dir={dir} />
          </div>
        </th>
        <Th col="assigned" sortKey={sortKey} dir={dir} onSort={onSort}>
          Assigned
        </Th>
        <Th col="open" sortKey={sortKey} dir={dir} onSort={onSort}>
          Open
        </Th>
        <Th col="overdue" sortKey={sortKey} dir={dir} onSort={onSort}>
          Overdue
        </Th>
        <Th col="completed" sortKey={sortKey} dir={dir} onSort={onSort}>
          Done
        </Th>
        <Th col="points" sortKey={sortKey} dir={dir} onSort={onSort}>
          Points
        </Th>
        <th className="py-2.5 px-3 text-[11px] font-semibold text-muted-foreground text-left whitespace-nowrap">
          Due · last {days}d
        </th>
      </tr>
    </thead>
  );
}

function NumCell({ value }) {
  return (
    <td className="py-4 px-3 text-center vertical-middle">
      <span
        className={cn(
          "font-semibold tabular-nums",
          value === 0 && "text-muted-foreground/30",
        )}
      >
        {value}
      </span>
    </td>
  );
}

function OverduePillCell({ n }) {
  if (!n) {
    return (
      <td className="py-4 px-3 text-center vertical-middle">
        <span className="text-muted-foreground/30 tabular-nums">0</span>
      </td>
    );
  }
  const tone =
    n >= 5
      ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
      : n >= 3
        ? "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";

  return (
    <td className="py-4 px-3 text-center vertical-middle">
      <span
        className={cn(
          "px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums",
          tone,
        )}
      >
        {n}
      </span>
    </td>
  );
}

function HeatmapChart({ rowData, dates, stripMax }) {
  return (
    <td className="py-4 px-3 align-middle">
      <div className="flex gap-0.5 items-end h-10 min-w-[120px]">
        {dates.map((d) => {
          const v = rowData.days?.[d] ?? 0;
          const heightPercent = stripMax > 0 ? (v / stripMax) * 100 : 0;
          const barHeight = v > 0 ? `${Math.max(heightPercent, 20)}%` : "4px";

          return (
            <span
              key={d}
              title={v > 0 ? `${fmtDay(d)} -> ${v} due` : fmtDay(d)}
              style={{ height: barHeight }}
              className={cn(
                "w-2.5 rounded-[1px] flex-shrink-0 transition-all duration-150 hover:scale-105 origin-bottom",
                getStripColorClass(v),
              )}
            />
          );
        })}
      </div>
    </td>
  );
}

function TableRowItem({ row, dates, stripMax, onDrill }) {
  return (
    <tr
      onClick={() => onDrill(row)}
      className="group cursor-pointer hover:bg-muted/40 transition-colors"
    >
      <td className="py-4 px-3 sticky left-0 bg-card group-hover:bg-muted transition-colors z-10 border-r border-border">
        <div className="flex items-center gap-2.5 min-w-[11rem] max-w-[14rem]">
          <Avatar user={row.user} name={row.user.full_name} size="sm" />
          <span className="font-medium text-foreground truncate">
            {row.user.full_name || row.user.email}
          </span>
        </div>
      </td>
      <NumCell value={row.assigned} />
      <NumCell value={row.open} />
      <OverduePillCell n={row.overdue} />
      <NumCell value={row.completed} />
      <NumCell value={row.points} />
      <HeatmapChart rowData={row} dates={dates} stripMax={stripMax} />
    </tr>
  );
}

// ── 3. MAIN COMPONENT ────────────────────────────────────────────────────────

export default function TeamsTab({
  workspaceId,
  startDate,
  endDate,
  filterParams = {},
}) {
  const days = useMemo(
    () => rangeDays(startDate, endDate),
    [startDate, endDate],
  );
  const [pageUrl, setPageUrl] = useState(null);
  const [sortKey, setSortKey] = useState("assigned");
  const [dir, setDir] = useState("desc");
  const [drill, setDrill] = useState(null);

  // Reset to the first cursor page whenever the scope (filters/window) changes.
  useEffect(() => {
    setPageUrl(null);
  }, [filterParams, days]);

  const { data, isLoading } = useTeamWorkload(workspaceId, {
    days,
    params: filterParams,
    pageUrl,
  });

  const dates = useMemo(() => {
    const first = data?.results?.[0];
    return first?.days ? Object.keys(first.days).sort() : [];
  }, [data]);

  const rows = useMemo(() => {
    const list = [...(data?.results || [])];
    const fn = SORTS[sortKey];
    if (fn) list.sort((a, b) => (dir === "asc" ? fn(a, b) : fn(b, a)));
    return list;
  }, [data, sortKey, dir]);

  const stripMax = useMemo(
    () =>
      Math.max(1, ...rows.flatMap((r) => dates.map((d) => r.days?.[d] ?? 0))),
    [rows, dates],
  );

  // Grouped Open / Overdue / Done per member — shows delivery health at a glance.
  const workloadBars = useMemo(() => {
    if (!rows.length) return null;
    return {
      categories: rows.map((r) => r.user.full_name || r.user.email),
      series: [
        { name: "Open", data: rows.map((r) => r.open), color: "#6366f1" },
        { name: "Overdue", data: rows.map((r) => r.overdue), color: "#ef4444" },
        { name: "Done", data: rows.map((r) => r.completed), color: "#22c55e" },
      ],
    };
  }, [rows]);

  const handleSort = (key) => {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <WorkloadHeader days={days} />

      {isLoading ? (
        <WorkloadSkeleton />
      ) : !rows.length ? (
        <p className="text-xs text-muted-foreground py-10 text-center">
          No assigned tasks in this scope
        </p>
      ) : (
        <>
          {/* Open / Overdue / Done grouped per member */}
          {workloadBars && (
            <div className="mb-5">
              <p className="text-[11px] font-semibold text-muted-foreground mb-2">
                Open, overdue and done per member — click a bar to see their
                tasks
              </p>
              <BarChart
                series={workloadBars.series}
                categories={workloadBars.categories}
                stacked
                height={260}
                onBarClick={(i) => setDrill({ member: rows[i] })}
              />
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs border-collapse layout-fixed">
              <TableHeader
                sortKey={sortKey}
                dir={dir}
                onSort={handleSort}
                days={days}
              />
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => (
                  <TableRowItem
                    key={r.user.id}
                    row={r}
                    dates={dates}
                    stripMax={stripMax}
                    onDrill={(member) => setDrill({ member })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {(data?.previous || data?.next) && (
            <div className="flex justify-center items-center gap-3 pt-4">
              <button
                onClick={() => setPageUrl(data.previous)}
                disabled={!data.previous}
                className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded-md hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                &larr; Prev
              </button>
              <button
                onClick={() => setPageUrl(data.next)}
                disabled={!data.next}
                className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded-md hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next &rarr;
              </button>
            </div>
          )}
        </>
      )}

      <TaskDrilldownModal
        open={!!drill}
        onClose={() => setDrill(null)}
        workspaceId={workspaceId}
        title={
          drill
            ? `${drill.member.user.full_name || drill.member.user.email}'s tasks`
            : ""
        }
        description="All tasks assigned to this member"
        params={{
          ...filterParams,
          assignee: drill?.member.user.id,
        }}
      />
    </div>
  );
}
