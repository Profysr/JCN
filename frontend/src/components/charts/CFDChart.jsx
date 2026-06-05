import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import ChartCard from "./ChartCard";

// Distinct palette for status areas (cycles if many statuses)
const PALETTE = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#84cc16",
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs min-w-[140px]">
      <p className="font-semibold mb-1.5">{label}</p>
      {[...payload].reverse().map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: p.fill }} />
            <span className="text-muted-foreground truncate max-w-[90px]">{p.name}</span>
          </div>
          <span className="font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1.5 pt-1.5 flex justify-between">
        <span className="text-muted-foreground">Total</span>
        <span className="font-bold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

export default function CFDChart({ data, loading }) {
  const statuses = data?.statuses || [];
  const chartData = data?.data || [];
  const isEmpty = chartData.length === 0;

  // Format X-axis: show every 5th label to avoid crowding
  const tickInterval = Math.max(1, Math.floor(chartData.length / 6));

  return (
    <ChartCard
      title="Cumulative Flow Diagram"
      subtitle="Task count per status over time — bottlenecks widen visible"
      loading={loading}
      empty={isEmpty}
      emptyText="Add a project and start working to see flow"
    >
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            interval={tickInterval - 1}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="square"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          {statuses.map((s, i) => (
            <Area
              key={s.id}
              type="monotone"
              dataKey={s.name}
              stackId="1"
              stroke={s.color || PALETTE[i % PALETTE.length]}
              fill={s.color || PALETTE[i % PALETTE.length]}
              fillOpacity={0.75}
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
