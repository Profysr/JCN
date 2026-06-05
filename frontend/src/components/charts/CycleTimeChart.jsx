import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, ZAxis } from "recharts";
import ChartCard from "./ChartCard";
import { PRIORITIES } from "@/lib/constants";

const PRIORITY_COLOR = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.hex]));

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[200px]">
      <p className="font-semibold truncate mb-1">{d.title}</p>
      <div className="space-y-0.5 text-muted-foreground">
        <p>Cycle time: <span className="font-semibold text-foreground">{d.cycle_days}d</span></p>
        <p>Completed: <span className="font-semibold text-foreground">{d.completed_date}</span></p>
        <p>Priority: <span className="font-semibold text-foreground capitalize">{d.priority}</span></p>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-muted/60">
      <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}d</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}

export default function CycleTimeChart({ data, loading }) {
  const points = data?.data_points || [];
  const stats  = data?.stats || {};
  const isEmpty = points.length === 0;

  // Convert completed_date string to a numeric x-axis value
  const chartData = points.map((p) => ({
    ...p,
    x: new Date(p.completed_date).getTime(),
    y: p.cycle_days,
  }));

  return (
    <ChartCard
      title="Cycle Time"
      subtitle="Time from first activity → Done per task"
      loading={loading}
      empty={isEmpty}
      emptyText="Complete tasks with in-progress activity to see cycle time"
    >
      {/* Stats row */}
      {stats.count > 0 && (
        <div className="flex gap-2 mb-3 flex-wrap">
          <StatPill label="Median" value={stats.median} color="hsl(var(--primary))" />
          <StatPill label="P75"    value={stats.p75}    color="#f59e0b" />
          <StatPill label="P95"    value={stats.p95}    color="#ef4444" />
          <StatPill label="Avg"    value={stats.avg}    color="#6366f1" />
          <div className="flex flex-col items-center px-3 py-1.5 rounded-lg bg-muted/60">
            <span className="text-lg font-bold tabular-nums">{stats.count}</span>
            <span className="text-[10px] text-muted-foreground">Tasks</span>
          </div>
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="x"
            type="number"
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
            name="Date"
          />
          <YAxis
            dataKey="y"
            name="Days"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            label={{ value: "days", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))", dy: 25 }}
          />
          <ZAxis range={[40, 40]} />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          {stats.median > 0 && (
            <ReferenceLine
              y={stats.median}
              stroke="hsl(var(--primary))"
              strokeDasharray="4 2"
              label={{ value: `Median ${stats.median}d`, fontSize: 10, fill: "hsl(var(--primary))", position: "insideTopRight" }}
            />
          )}
          {/* Group by priority color */}
          {PRIORITIES.map((pri) => {
            const subset = chartData.filter((d) => d.priority === pri.value);
            if (!subset.length) return null;
            return (
              <Scatter
                key={pri.value}
                name={pri.label}
                data={subset}
                fill={pri.hex}
                fillOpacity={0.8}
              />
            );
          })}
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
