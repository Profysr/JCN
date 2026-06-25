import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { usePortfolio } from "@/shared/hooks/useMyWork";
import { usePermission } from "@/contexts/PermissionsContext";
import { useDeleteBoard } from "@/apps/project-management/hooks/useBoards";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { DeleteBoardModal } from "@/shared/components/ui/ConfirmModal";
import CreateBoardModal from "@/apps/project-management/components/projects/CreateBoardModal";
import { Plus, ArrowRight, AlertTriangle, Zap, Trash2 } from "lucide-react";
import BoardTypeIcon from "@/shared/components/ui/BoardTypeIcon";
import { cn } from "@/shared/lib/utils";
import { Loader } from "@/shared/components/ui/Loader";

const HEALTH = {
  on_track: {
    label: "On Track",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    badge: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  at_risk: {
    label: "At Risk",
    dot: "bg-yellow-400",
    bar: "bg-yellow-400",
    badge: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
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
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0", cfg.badge)}>
      <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────────── */
export default function BoardsPage() {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const { data: projects, isLoading } = usePortfolio(workspaceId);
  const { can, isOwner } = usePermission();
  const deleteBoard = useDeleteBoard(workspaceId);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const canCreateBoard = isOwner || can("board.create");
  const canDeleteBoard = isOwner || can("board.delete");

  const list = projects ?? [];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Boards</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {list.length} board{list.length !== 1 ? "s" : ""} in this workspace
          </p>
        </div>
        {canCreateBoard && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New Board
          </Button>
        )}
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
          const done = itm.done_tasks ?? 0;
          const total = itm.total_tasks ?? 0;
          const pct = itm.completion_pct ?? (total > 0 ? Math.round((done / total) * 100) : 0);
          const healthCfg = HEALTH[itm.health];
          const barCls = healthCfg ? healthCfg.bar : "bg-primary";

          return (
            <div
              key={itm.id}
              onClick={() => navigate(`/w/${workspaceId}/boards/${itm.id}`)}
              className="relative min-w-[320px] flex-1 group/card cursor-pointer rounded-xl border bg-card p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all duration-200 overflow-hidden"
            >
              {/* Header — board type icon left, health badge + delete right */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <BoardTypeIcon board_type={itm.board_type} size="lg" />

                <div className="flex items-center gap-1.5">
                  {itm.health && <HealthBadge health={itm.health} />}

                  {canDeleteBoard && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget(itm); }}
                      title="Delete board"
                      className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover/card:opacity-100 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <p className="font-semibold truncate pr-8">{itm.name}</p>
              {itm.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 pr-8">
                  {itm.description}
                </p>
              )}

              {/* Progress */}
              <div className="mt-4">
                {total > 0 ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{done}/{total} tasks</span>
                      <span className="font-medium">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all", barCls)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tasks yet</p>
                )}
              </div>

              {/* Footer meta */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {itm.overdue_tasks > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-red-500">
                    <AlertTriangle className="w-3 h-3" />
                    {itm.overdue_tasks} overdue
                  </span>
                )}
                <span className={cn(
                  "flex items-center gap-1 text-[11px] truncate",
                  itm.active_sprints?.length > 0
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40 italic",
                )}>
                  <Zap className="w-3 h-3 flex-shrink-0" />
                  {itm.active_sprints?.length > 0
                    ? itm.active_sprints[0].name
                    : "No active sprint"}
                </span>
              </div>

              {/* Animated right-centre arrow — slides in on hover */}
              <div
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 translate-x-2 group-hover/card:opacity-100 group-hover/card:translate-x-0 transition-all duration-200"
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <ArrowRight className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <CreateBoardModal
        workspaceId={workspaceId}
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      <DeleteBoardModal
        board={deleteTarget}
        isPending={deleteBoard.isPending}
        onConfirm={() => deleteBoard.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) })}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
