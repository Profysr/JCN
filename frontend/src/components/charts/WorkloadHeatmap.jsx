import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import ChartCard from "./ChartCard";

// Intensity → background color (5 levels)
function intensityClass(val, max) {
  if (val === 0) return "bg-muted/40";
  const ratio = val / max;
  if (ratio < 0.2) return "bg-primary/20";
  if (ratio < 0.4) return "bg-primary/40";
  if (ratio < 0.7) return "bg-primary/60";
  if (ratio < 0.9) return "bg-primary/80";
  return "bg-primary";
}

function intensityText(val, max) {
  if (val === 0) return "text-muted-foreground/40";
  const ratio = val / max;
  return ratio >= 0.7 ? "text-primary-foreground" : "text-primary";
}

export default function WorkloadHeatmap({ data, loading }) {
  const dates   = data?.dates   || [];
  const members = data?.members || [];
  const isEmpty = members.length === 0;

  // Max value across all cells for intensity scaling
  const maxVal = members.reduce((m, row) => {
    const rowMax = Math.max(...Object.values(row.days || {}));
    return Math.max(m, rowMax);
  }, 1);

  const formatDay = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("default", { weekday: "short" }).slice(0, 3);
  };
  const formatDate = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <ChartCard
      title="Workload Heatmap"
      subtitle="Tasks due per member per day — darker = more work"
      loading={loading}
      empty={isEmpty}
      emptyText="Assign tasks with due dates to see heatmap"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-muted-foreground font-normal w-28 pb-1">Member</th>
              {dates.map((d) => (
                <th key={d} className="text-center text-muted-foreground font-normal pb-1 min-w-[36px]">
                  <div>{formatDay(d)}</div>
                  <div className="text-[10px] opacity-70">{formatDate(d)}</div>
                </th>
              ))}
              <th className="text-center text-muted-foreground font-normal pb-1 pl-1">Total</th>
            </tr>
          </thead>
          <tbody>
            {members.map((row) => (
              <tr key={row.user_id}>
                <td className="py-0.5">
                  <div className="flex items-center gap-1.5">
                    <Avatar name={row.name} size="xs" />
                    <span className="truncate max-w-[80px] text-foreground">{row.name}</span>
                  </div>
                </td>
                {dates.map((d) => {
                  const val = row.days?.[d] || 0;
                  return (
                    <td key={d} className="py-0.5">
                      <div
                        className={cn(
                          "w-8 h-7 rounded flex items-center justify-center font-semibold tabular-nums mx-auto",
                          intensityClass(val, maxVal),
                          intensityText(val, maxVal),
                        )}
                        title={`${row.name}: ${val} task${val !== 1 ? "s" : ""} due ${d}`}
                      >
                        {val > 0 ? val : ""}
                      </div>
                    </td>
                  );
                })}
                <td className="text-center font-bold tabular-nums text-muted-foreground pl-1">
                  {row.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1 mt-3">
        <span className="text-[10px] text-muted-foreground mr-1">Less</span>
        {[0, 0.2, 0.4, 0.7, 0.95].map((ratio, i) => (
          <div key={i} className={cn("w-4 h-4 rounded", intensityClass(ratio * maxVal, maxVal))} />
        ))}
        <span className="text-[10px] text-muted-foreground ml-1">More</span>
      </div>
    </ChartCard>
  );
}
