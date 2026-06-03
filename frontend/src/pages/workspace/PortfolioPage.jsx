import { useParams, useNavigate } from "react-router-dom";
import { usePortfolio } from "@/hooks/useMyWork";
import { cn } from "@/lib/utils";

const HEALTH = {
  on_track:  { label: "On Track",  dot: "bg-emerald-400", badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", emoji: "🟢" },
  at_risk:   { label: "At Risk",   dot: "bg-yellow-400",  badge: "bg-yellow-50  text-yellow-700  dark:bg-yellow-950  dark:text-yellow-300",  emoji: "🟡" },
  off_track: { label: "Off Track", dot: "bg-red-400",     badge: "bg-red-50     text-red-700     dark:bg-red-950     dark:text-red-300",     emoji: "🔴" },
};

function HealthBadge({ health }) {
  const cfg = HEALTH[health] || HEALTH.on_track;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold", cfg.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export default function PortfolioPage() {
  const { workspaceSlug } = useParams();
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = usePortfolio(workspaceSlug);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading portfolio…</div>;
  }

  const onTrack  = projects.filter(p => p.health === "on_track").length;
  const atRisk   = projects.filter(p => p.health === "at_risk").length;
  const offTrack = projects.filter(p => p.health === "off_track").length;

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      <div className="px-6 py-5 border-b border-border bg-card flex-shrink-0">
        <h1 className="text-base font-semibold mb-3">Portfolio</h1>
        {/* Summary chips */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { label: "On Track",  val: onTrack,  cls: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300" },
            { label: "At Risk",   val: atRisk,   cls: "text-yellow-600  bg-yellow-50  dark:bg-yellow-950  dark:text-yellow-300"  },
            { label: "Off Track", val: offTrack, cls: "text-red-600     bg-red-50     dark:bg-red-950     dark:text-red-300"     },
          ].map(s => (
            <div key={s.label} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold", s.cls)}>
              <span className="text-base">{s.val}</span>
              <span className="font-normal opacity-80">{s.label}</span>
            </div>
          ))}
          <span className="text-xs text-muted-foreground ml-auto">{projects.length} projects</span>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.length === 0 ? (
          <div className="col-span-full text-center py-20 text-muted-foreground text-sm">
            No active projects in this workspace.
          </div>
        ) : (
          projects.map(p => {
            const pct = p.completion_pct || 0;
            const cfg = HEALTH[p.health] || HEALTH.on_track;
            return (
              <div
                key={p.id}
                className="bg-card border border-border rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow cursor-pointer"
                onClick={() => navigate(`/w/${workspaceSlug}/projects/${p.id}`)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                  <HealthBadge health={p.health} />
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-1.5">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", cfg.dot.replace("bg-", "bg-").replace("-400", "-400"))}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-3">
                  <span>{p.done_tasks}/{p.total_tasks} tasks</span>
                  <span>{pct}%</span>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-[11px]">
                  {p.overdue_tasks > 0 && (
                    <span className="text-red-500 font-medium">⚠ {p.overdue_tasks} overdue</span>
                  )}
                  {p.active_sprints?.length > 0 && (
                    <span className="text-muted-foreground">🏃 {p.active_sprints[0].name}</span>
                  )}
                  {p.overdue_tasks === 0 && p.active_sprints?.length === 0 && (
                    <span className="text-emerald-500">✓ No issues</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
