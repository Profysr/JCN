import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import ChartCard from "./ChartCard";

const CHART_COLOR_SP    = "hsl(var(--primary))";
const CHART_COLOR_TASKS = "#22c55e";
const CHART_COLOR_AVG   = "#f59e0b";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function VelocityChart({ data, avgSP, avgTasks, loading }) {
  const isEmpty = !data?.sprints?.length;

  return (
    <ChartCard
      title="Sprint Velocity"
      subtitle="Story points & tasks completed per sprint"
      loading={loading}
      empty={isEmpty}
      emptyText="Complete a sprint to see velocity data"
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data?.sprints || []} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="sprint_name"
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          />
          <Bar dataKey="story_points" name="Story Points" fill={CHART_COLOR_SP} radius={[4, 4, 0, 0]} maxBarSize={48} />
          <Bar dataKey="tasks_completed" name="Tasks" fill={CHART_COLOR_TASKS} radius={[4, 4, 0, 0]} maxBarSize={48} />
          {avgSP > 0 && (
            <ReferenceLine
              y={avgSP}
              stroke={CHART_COLOR_AVG}
              strokeDasharray="4 2"
              label={{ value: `Avg ${avgSP}SP`, fontSize: 10, fill: CHART_COLOR_AVG, position: "insideTopRight" }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
