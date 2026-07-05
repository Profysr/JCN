import {
  ChevronDown,
  ChevronRight,
  Building2,
  X,
  UserMinus,
  Loader2,
} from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { NODE_W, NODE_H } from "./orgChartLayout";

// ── Node card ─────────────────────────────────────────────────────────────────
export function OrgNode({ node, x, y, zoom, isSelected, onSelect, onDragStart, isAdmin, isExpanded, isLoading, onToggle }) {
  const hasChildren = node.has_reports && !node.virtual;
  const compact = zoom < 0.65;

  if (node.virtual) {
    return (
      <g transform={`translate(${x - NODE_W / 2}, ${y})`}>
        <rect
          width={NODE_W}
          height={NODE_H}
          rx={8}
          className="fill-primary/10 stroke-primary/30"
          strokeWidth={1.5}
        />
        <foreignObject width={NODE_W} height={NODE_H}>
          <div className="flex items-center justify-center h-full gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-primary">{node.name}</span>
          </div>
        </foreignObject>
      </g>
    );
  }

  return (
    <g transform={`translate(${x - NODE_W / 2}, ${y})`}>
      {/* Shadow/selection ring */}
      {isSelected && (
        <rect width={NODE_W} height={NODE_H} rx={8} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} />
      )}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        className={cn(
          "fill-card stroke-border transition-colors duration-150",
          isSelected ? "stroke-primary" : "hover:stroke-primary/40",
        )}
        strokeWidth={1}
        style={{
          filter: isSelected ? "drop-shadow(0 0 6px hsl(var(--primary)/0.3))" : undefined,
          cursor: isAdmin ? "grab" : "pointer",
        }}
        onClick={() => onSelect(node)}
        onMouseDown={(e) => isAdmin && e.button === 0 && onDragStart(e, node)}
      />
      <foreignObject width={NODE_W} height={NODE_H} style={{ pointerEvents: "none" }}>
        <div className={cn("flex items-center gap-2.5 h-full px-3", compact ? "py-2" : "py-3")}>
          <Avatar user={node} name={node.name || node.email} size={compact ? "xs" : "sm"} className="flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate leading-tight">{node.name || node.email}</p>
            {!compact && node.job_title && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight">{node.job_title}</p>
            )}
            {!compact && node.teams?.length > 0 && (
              <p className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
                {node.teams.map((t) => t.name).join(", ")}
              </p>
            )}
          </div>
        </div>
      </foreignObject>

      {/* Pending-review indicator */}
      {node.onboarding_status === "submitted" && (
        <circle cx={NODE_W - 10} cy={10} r={5} fill="#f59e0b" />
      )}

      {/* Expand/collapse toggle — fetches this node's direct reports on first click */}
      {hasChildren && (
        <g transform={`translate(${NODE_W / 2 - 9}, ${NODE_H - 9})`} onClick={() => onToggle(node.id)} style={{ cursor: "pointer" }}>
          <circle r={9} className="fill-background stroke-border" strokeWidth={1} />
          {isLoading ? (
            <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" style={{ transform: "translate(-6px,-6px)" }} />
          ) : isExpanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" style={{ transform: "translate(-6px,-6px)" }} />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" style={{ transform: "translate(-6px,-6px)" }} />
          )}
          {!isLoading && (
            <text x={0} y={4} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">
              {node.direct_reports_count}
            </text>
          )}
        </g>
      )}
    </g>
  );
}

// ── Edge (connector line) ─────────────────────────────────────────────────────
export function Edge({ fromPos, toPos }) {
  if (!fromPos || !toPos) return null;
  const x1 = fromPos.x;
  const y1 = fromPos.y + NODE_H;
  const x2 = toPos.x;
  const y2 = toPos.y;
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />;
}

// ── Department card header (collapsed/expanded toggle target) ────────────────
export function DeptHeader({ dept, x, y, w, expanded, memberCount, loading, onToggle }) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onToggle(dept.id)}
      style={{ cursor: "pointer" }}
    >
      <foreignObject width={w} height={36}>
        <div className="flex items-center gap-1.5 h-full px-4">
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" style={{ color: dept.color }} />
          ) : expanded ? (
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: dept.color }} />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: dept.color }} />
          )}
          <span className="text-[11px] font-semibold truncate" style={{ color: dept.color }}>
            {dept.name}
          </span>
          {memberCount != null && (
            <span className="text-[10px] text-muted-foreground/70">({memberCount})</span>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

// ── Profile popover ───────────────────────────────────────────────────────────
export function NodePopover({ node, onClose, isAdmin, onRemoveManager }) {
  const STATUS_BADGE = {
    submitted: { label: "Pending review", className: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
    approved: null,
    draft: { label: "Incomplete profile", className: "bg-muted text-muted-foreground" },
  };
  const statusBadge = STATUS_BADGE[node.onboarding_status] ?? null;

  return (
    <div
      className="absolute z-50 right-4 top-4 w-72 bg-card border rounded-xl shadow-lg overflow-hidden animate-scale-in"
      style={{ transformOrigin: "top right" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="text-sm font-semibold">Profile</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-accent text-muted-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-4 flex flex-col items-center text-center gap-3">
        <Avatar user={node} name={node.name || node.email} size="lg" />
        <div>
          <p className="font-semibold text-sm">{node.name || node.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{node.email}</p>
          {node.job_title && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{node.job_title}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1 justify-center">
          <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium", node.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {node.role}
          </span>
          {statusBadge && (
            <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium", statusBadge.className)}>
              {statusBadge.label}
            </span>
          )}
        </div>

        {node.departments?.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {node.departments.map((d) => (
              <span key={d.id} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {d.name}
              </span>
            ))}
          </div>
        )}
        {node.teams?.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {node.teams.map((t) => (
              <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                {t.name}
              </span>
            ))}
          </div>
        )}

        {isAdmin && node.manager_id && node.reporting_line_id && (
          <button
            onClick={() => onRemoveManager(node)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors mt-1"
          >
            <UserMinus className="w-3.5 h-3.5" /> Remove manager
          </button>
        )}
      </div>
    </div>
  );
}

// ── Drag-to-reparent overlay ──────────────────────────────────────────────────
export function DragOverlay({ node, x, y }) {
  if (!node) return null;
  return (
    <div
      className="fixed pointer-events-none z-[100] border-2 border-primary bg-primary/10 rounded-lg flex items-center gap-2 px-3 py-2 shadow-lg"
      style={{ left: x - NODE_W / 2, top: y - NODE_H / 2, width: NODE_W, height: NODE_H }}
    >
      <Avatar user={node} name={node.name || node.email} size="xs" />
      <span className="text-xs font-semibold truncate">{node.name}</span>
    </div>
  );
}
