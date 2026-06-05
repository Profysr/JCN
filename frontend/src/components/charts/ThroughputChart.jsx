import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import ChartCard from "./ChartCard";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.[0]) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-0.5">{label}</p>
      <p className="text-muted-foreground">
        Completed: <span className="font-bold text-foreground">{payload[0].value}</span>
      </p>
    </div>
  );
}

export default function ThroughputChart({ data = [], period = "week", loading }) {
  const isEmpty = data.length === 0;

  const avg = data.length
    ? Math.round(data.reduce((s, d) => s + d.count, 0) / data.length)
    : 0;

  const periodLabel = { day: "Daily", week: "Weekly", month: "Monthly" }[period] ?? "Weekly";

  const formatLabel = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (period === "month") return d.toLocaleString("default", { month: "short", year: "2-digit" });
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <ChartCard
      title={`${periodLabel} Throughput`}
      subtitle="Tasks completed per period"
      loading={loading}
      empty={isEmpty}
      emptyText="No completed tasks in this period"
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatLabel}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--accent))" }} />
          <Bar dataKey="count" name="Completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="#f59e0b"
              strokeDasharray="4 2"
              label={{ value: `Avg ${avg}`, fontSize: 10, fill: "#f59e0b", position: "insideTopRight" }}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
