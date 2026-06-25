import { useWorkspaceOverview } from "@/shared/hooks/useAnalyticsV2";
import { getPriority } from "@/shared/lib/constants";

function HBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 truncate flex-shrink-0 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color || "hsl(var(--primary))" }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-6 text-right">{value}</span>
    </div>
  );
}

function BarsSkeleton() {
  return (
    <div className="space-y-3">
      {[85, 60, 45, 70, 30].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-24 h-3 bg-muted animate-pulse rounded" />
          <div
            className="h-2 bg-muted animate-pulse rounded-full flex-1"
            style={{ maxWidth: `${w}%`, animationDelay: `${i * 60}ms` }}
          />
          <div className="w-4 h-3 bg-muted animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

export default function TaskHealthSection({ workspaceId, boardId }) {
  const { data, isLoading } = useWorkspaceOverview(workspaceId, { boardId });

  const byStatus   = data?.tasks_by_status   || [];
  const byPriority = data?.tasks_by_priority || [];
  const maxS = Math.max(1, ...byStatus.map((s) => s.count));
  const maxP = Math.max(1, ...byPriority.map((p) => p.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel
        title="Tasks by Status"
        subtitle="Current distribution across workflow stages"
      >
        {isLoading ? <BarsSkeleton /> : !byStatus.length ? (
          <p className="text-xs text-muted-foreground py-8 text-center">No data yet</p>
        ) : (
          <div className="space-y-2.5">
            {byStatus.map((s) => (
              <HBar
                key={s.status__name}
                label={s.status__name || "None"}
                value={s.count}
                max={maxS}
                color={s.status__color}
              />
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Tasks by Priority"
        subtitle="Focus areas — urgent + high tasks should be actively moving"
      >
        {isLoading ? <BarsSkeleton /> : !byPriority.length ? (
          <p className="text-xs text-muted-foreground py-8 text-center">No data yet</p>
        ) : (
          <div className="space-y-2.5">
            {byPriority.map((p) => {
              const cfg = getPriority(p.priority);
              return (
                <HBar
                  key={p.priority}
                  label={cfg.label || p.priority}
                  value={p.count}
                  max={maxP}
                  color={cfg.hex}
                />
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
