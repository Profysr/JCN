import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import ChartCard from "./ChartCard";

const BUCKET_COLORS = [
  "#22c55e",  // < 1 day
  "#84cc16",  // 1-3 days
  "#f59e0b",  // 3-7 days
  "#f97316",  // 1-2 weeks
  "#ef4444",  // 2-4 weeks
  "#dc2626",  // > 30 days
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold">{label}</p>
      <p className="text-muted-foreground">Tasks: <span className="font-bold text-foreground">{payload[0].value}</span></p>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}d</span>
    </div>
  );
}

export default function LeadTimeChart({ data, loading }) {
  const histogram = data?.histogram || [];
  const stats     = data?.stats    || {};
  const isEmpty   = !histogram.some((b) => b.count > 0);

  return (
    <ChartCard
      title="Lead Time Distribution"
      subtitle="Time from task creation → Done"
      loading={loading}
      empty={isEmpty}
      emptyText="No completed tasks yet in this period"
    >
      {stats.count > 0 && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 mb-3 px-1">
          <StatRow label="Median" value={stats.median} />
          <StatRow label="Average" value={stats.avg} />
          <StatRow label="Min" value={stats.min} />
          <StatRow label="Max" value={stats.max} />
        </div>
      )}

      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={histogram} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
          <Bar dataKey="count" name="Tasks" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {histogram.map((_, i) => (
              <Cell key={i} fill={BUCKET_COLORS[i % BUCKET_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
