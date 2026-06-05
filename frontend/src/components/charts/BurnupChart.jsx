import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ChartCard from "./ChartCard";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
      {payload.length >= 2 && payload[0].value != null && payload[1].value != null && (
        <div className="border-t border-border mt-1 pt-1 flex justify-between">
          <span className="text-muted-foreground">Remaining</span>
          <span className="font-bold tabular-nums">{payload[0].value - payload[1].value}</span>
        </div>
      )}
    </div>
  );
}

export default function BurnupChart({ data, loading }) {
  const chartData = (data?.data || []).filter((d) => !d.is_future || d.completed > 0);
  const futureStart = (data?.data || []).find((d) => d.is_future)?.date;
  const isEmpty = chartData.length < 2;

  const formatDate = (v) => {
    if (!v) return "";
    const d = new Date(v);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <ChartCard
      title="Burnup Chart"
      subtitle="Total scope vs completed — scope creep visible when lines diverge"
      loading={loading}
      empty={isEmpty}
      emptyText="Select a sprint or project with tasks to see burnup"
    >
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatDate}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

          {/* Total scope — dashed */}
          <Line
            type="monotone"
            dataKey="total"
            name="Total Scope"
            stroke="#94a3b8"
            strokeDasharray="5 3"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          {/* Completed — solid */}
          <Line
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4 }}
          />

          {/* Today marker */}
          {futureStart && (
            <ReferenceLine
              x={futureStart}
              stroke="#94a3b8"
              strokeDasharray="3 3"
              label={{ value: "Today", fontSize: 10, fill: "#94a3b8", position: "insideTopLeft" }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
