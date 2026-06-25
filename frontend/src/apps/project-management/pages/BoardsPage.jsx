import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePortfolio } from "@/shared/hooks/useMyWork";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import CreateBoardModal from "@/apps/project-management/components/projects/CreateBoardModal";
import { Plus, ArrowRight, AlertTriangle, Zap } from "lucide-react";
import { APP_COLORS as PROJECT_COLORS } from "@/shared/lib/constants";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import { cn } from "@/shared/lib/utils";
import { Loader } from "@/shared/components/ui/Loader";

const HEALTH = {
  on_track: {
    label: "On Track",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    badge:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  at_risk: {
    label: "At Risk",
    dot: "bg-yellow-400",
    bar: "bg-yellow-400",
    badge:
      "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  },
  off_track: {
    label: "Off Track",
    dot: "bg-red-400",
    bar: "bg-red-400",
    badge: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  },
};

function HealthBadge({ health }) {
  const cfg = HEALTH[health];
  if (!cfg) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0",
        cfg.badge,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

export default function ProjectsPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { data: projects, isLoading } = usePortfolio(workspaceId);
  const [showCreate, setShowCreate] = useState(false);

  const list = projects ?? [];
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-muted-foreground text-sm">
              {list.length} board{list.length !== 1 ? "s" : ""} in this
              workspace
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-1.5" /> New Board
        </Button>
      </div>

      {isLoading && <Loader className="min-h-screen" />}

      {!isLoading && list.length === 0 && (
        <EmptyState
          illustration="projects"
          title="No boards yet"
          description="Create a board to start tracking work."
        />
      )}

      <div className="flex flex-wrap gap-4">
        {list.map((itm) => {
          const color =
            PROJECT_COLORS[itm.name.charCodeAt(0) % PROJECT_COLORS.length];
          const done = itm.done_tasks ?? 0;
          const total = itm.total_tasks ?? 0;
          const pct =
            itm.completion_pct ??
            (total > 0 ? Math.round((done / total) * 100) : 0);
          const healthCfg = HEALTH[itm.health];
          const barCls = healthCfg ? healthCfg.bar : "bg-primary";

          return (
            <button
              key={itm.id}
              onClick={() => navigate(`/w/${workspaceId}/boards/${itm.id}`)}
              className="min-w-[320px] flex-1 text-left rounded-md border bg-card p-5 hover:shadow-card-hover hover:border-primary/30 transition-all duration-200 group shadow-card"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <BoardTypeIcon board_type={itm.board_type} size="lg" />
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {itm.health && <HealthBadge health={itm.health} />}
                  <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
              </div>

              <p className="font-semibold truncate">{itm.name}</p>
              {itm.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {itm.description}
                </p>
              )}

              {/* Progress */}
              <div className="mt-4">
                {total > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {done}/{total} tasks
                      </span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          barCls,
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tasks yet</p>
                )}
              </div>

              {/* Footer indicators */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {itm.overdue_tasks > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    {itm.overdue_tasks} overdue
                  </span>
                )}
                <span
                  className={cn(
                    "flex items-center gap-1 text-[11px] truncate",
                    itm.active_sprints?.length > 0
                      ? "text-muted-foreground"
                      : "text-muted-foreground/40 italic",
                  )}
                >
                  <Zap className="w-3 h-3 flex-shrink-0" />
                  {itm.active_sprints?.length > 0
                    ? itm.active_sprints[0].name
                    : "No active sprint"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <CreateBoardModal
        workspaceId={workspaceId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
