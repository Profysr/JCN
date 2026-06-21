import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Building2,
  X,
  Users,
  GitBranch,
} from "lucide-react";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { useOrgChart } from "@/apps/org-structure/hooks/useOrg";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useAuthStore } from "@/store/authStore";
import { useMembers } from "@/shared/hooks/useMembers";
import api from "@/shared/lib/api";

// ── Layout constants ──────────────────────────────────────────────────────────
const NODE_W = 180;
const NODE_H = 80;
const H_GAP  = 40;   // horizontal gap between siblings
const V_GAP  = 70;   // vertical gap between levels

// ── Tree layout algorithm ─────────────────────────────────────────────────────
function buildTree(nodes) {
  const byId = {};
  nodes.forEach((n) => { byId[n.id] = { ...n, children: [] }; });

  const roots = [];
  nodes.forEach((n) => {
    if (n.manager_id && byId[n.manager_id]) {
      byId[n.manager_id].children.push(byId[n.id]);
    } else {
      roots.push(byId[n.id]);
    }
  });

  // If multiple roots, wrap in a virtual root
  if (roots.length > 1) {
    return [{ id: "__root__", name: "Company", virtual: true, children: roots }];
  }
  return roots;
}

function computeSubtreeWidth(node, collapsed) {
  if (collapsed.has(node.id) || !node.children || node.children.length === 0) {
    return NODE_W;
  }
  const childrenW = node.children.reduce(
    (acc, child, i) =>
      acc + computeSubtreeWidth(child, collapsed) + (i > 0 ? H_GAP : 0),
    0,
  );
  return Math.max(NODE_W, childrenW);
}

function layoutTree(nodes, collapsed) {
  const positions = {};
  const edges = [];

  function layout(node, x, y) {
    if (node.virtual) {
      positions[node.id] = { x, y, node };
    } else {
      positions[node.id] = { x, y, node };
    }

    if (collapsed.has(node.id) || !node.children || node.children.length === 0) return;

    const children = node.children;
    const totalW = children.reduce(
      (acc, child, i) =>
        acc + computeSubtreeWidth(child, collapsed) + (i > 0 ? H_GAP : 0),
      0,
    );
    let childX = x - totalW / 2 + computeSubtreeWidth(children[0], collapsed) / 2;
    const childY = y + NODE_H + V_GAP;

    children.forEach((child, i) => {
      const cw = computeSubtreeWidth(child, collapsed);
      layout(child, childX, childY);
      edges.push({ from: node.id, to: child.id });
      childX += cw + H_GAP;
    });
  }

  nodes.forEach((root, i) => {
    layout(root, i * (NODE_W + H_GAP), 0);
  });

  return { positions, edges };
}

// ── Department-grouped layout ─────────────────────────────────────────────────
function buildDeptLayout(nodes) {
  const deptMap = {};
  const noDept = [];
  nodes.forEach((n) => {
    if (n.departments.length === 0) {
      noDept.push(n);
    } else {
      n.departments.forEach((d) => {
        if (!deptMap[d.id]) deptMap[d.id] = { dept: d, members: [] };
        deptMap[d.id].members.push(n);
      });
    }
  });

  const groups = Object.values(deptMap);
  if (noDept.length) groups.push({ dept: { id: "__no_dept__", name: "No Department", color: "#94a3b8" }, members: noDept });

  const positions = {};
  const deptRects = [];
  const COLS = 4;
  const CARD_W = NODE_W;
  const CARD_H = NODE_H;
  const PADDING = 24;
  const DEPT_HEADER = 36;

  let yOffset = 0;
  groups.forEach(({ dept, members }) => {
    const cols = Math.min(COLS, members.length);
    const rows = Math.ceil(members.length / COLS);
    const rectW = cols * (CARD_W + H_GAP) - H_GAP + PADDING * 2;
    const rectH = DEPT_HEADER + rows * (CARD_H + 16) - 16 + PADDING;
    deptRects.push({ dept, x: 0, y: yOffset, w: rectW, h: rectH });

    members.forEach((m, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      positions[m.id] = {
        x: PADDING + col * (CARD_W + H_GAP),
        y: yOffset + DEPT_HEADER + row * (CARD_H + 16),
        node: m,
      };
    });
    yOffset += rectH + 24;
  });

  return { positions, deptRects, edges: [] };
}

// ── Node card ─────────────────────────────────────────────────────────────────
function OrgNode({ node, x, y, zoom, isSelected, onSelect, onDragStart, isAdmin, collapsed, onToggle }) {
  const hasChildren = node.children && node.children.length > 0 && !node.virtual;
  const isCollapsed = collapsed.has(node.id);
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
        style={{ filter: isSelected ? "drop-shadow(0 0 6px hsl(var(--primary)/0.3))" : undefined }}
        onClick={() => onSelect(node)}
        onMouseDown={(e) => isAdmin && e.button === 0 && onDragStart(e, node)}
        style={{ cursor: isAdmin ? "grab" : "pointer" }}
      />
      <foreignObject width={NODE_W} height={NODE_H} style={{ pointerEvents: "none" }}>
        <div className={cn("flex items-center gap-2.5 h-full px-3", compact ? "py-2" : "py-3")}>
          <Avatar name={node.name || node.email} size={compact ? "xs" : "sm"} className="flex-shrink-0" />
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

      {/* Collapse/expand toggle */}
      {hasChildren && (
        <g transform={`translate(${NODE_W / 2 - 9}, ${NODE_H - 9})`} onClick={() => onToggle(node.id)} style={{ cursor: "pointer" }}>
          <circle r={9} className="fill-background stroke-border" strokeWidth={1} />
          {isCollapsed
            ? <ChevronRight className="w-3 h-3 text-muted-foreground" style={{ transform: "translate(-6px,-6px)" }} />
            : <ChevronDown className="w-3 h-3 text-muted-foreground" style={{ transform: "translate(-6px,-6px)" }} />}
          <text x={0} y={4} textAnchor="middle" fontSize={8} fill="hsl(var(--muted-foreground))">
            {node.children.length}
          </text>
        </g>
      )}
    </g>
  );
}

// ── Edge (connector line) ─────────────────────────────────────────────────────
function Edge({ fromPos, toPos }) {
  if (!fromPos || !toPos) return null;
  const x1 = fromPos.x;
  const y1 = fromPos.y + NODE_H;
  const x2 = toPos.x;
  const y2 = toPos.y;
  const midY = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  return <path d={d} fill="none" stroke="hsl(var(--border))" strokeWidth={1.5} />;
}

// ── Profile popover ───────────────────────────────────────────────────────────
function NodePopover({ node, onClose, isAdmin, workspaceId, members }) {
  const member = members.find((m) => m.id === node.id);

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
        <Avatar name={node.name || node.email} size="lg" />
        <div>
          <p className="font-semibold text-sm">{node.name || node.email}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{node.email}</p>
          {node.job_title && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{node.job_title}</p>
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
        <span className={cn("text-[10px] px-2 py-0.5 rounded font-medium", node.role === "admin" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
          {node.role}
        </span>
      </div>
    </div>
  );
}

// ── Drag-to-reparent overlay ──────────────────────────────────────────────────
function DragOverlay({ node, x, y }) {
  if (!node) return null;
  return (
    <div
      className="fixed pointer-events-none z-[100] border-2 border-primary bg-primary/10 rounded-lg flex items-center gap-2 px-3 py-2 shadow-lg"
      style={{ left: x - NODE_W / 2, top: y - NODE_H / 2, width: NODE_W, height: NODE_H }}
    >
      <Avatar name={node.name || node.email} size="xs" />
      <span className="text-xs font-semibold truncate">{node.name}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { workspaceId } = useParams();
  const { data, isLoading } = useOrgChart(workspaceId);
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const { user } = useAuthStore();
  const nodes = data?.nodes ?? [];

  const currentMember = members.find((m) => m.user?.email === user?.email);
  const isAdmin = currentMember?.role === "admin" || workspace?.owner?.email === user?.email;

  // Pan / zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // View mode: "hierarchy" | "department"
  const [viewMode, setViewMode] = useState("hierarchy");

  // Collapsed nodes set
  const [collapsed, setCollapsed] = useState(new Set());
  const toggleCollapse = (id) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Selected / popover node
  const [selectedNode, setSelectedNode] = useState(null);

  // Drag state (reparent)
  const [drag, setDrag] = useState(null); // { node, screenX, screenY }
  const [dragOver, setDragOver] = useState(null); // target node id

  // ── Layout computation ────────────────────────────────────────────────────
  const { positions, edges, deptRects } = useMemo(() => {
    if (!nodes.length) return { positions: {}, edges: [], deptRects: [] };
    if (viewMode === "department") {
      return buildDeptLayout(nodes);
    }
    const roots = buildTree(nodes);
    const { positions, edges } = layoutTree(roots, collapsed);
    return { positions, edges, deptRects: [] };
  }, [nodes, collapsed, viewMode]);

  // Compute SVG bounds to fit all nodes
  const { svgW, svgH } = useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x);
    const ys = Object.values(positions).map((p) => p.y);
    if (!xs.length) return { svgW: 800, svgH: 600 };
    const minX = Math.min(...xs) - NODE_W / 2 - 40;
    const maxX = Math.max(...xs) + NODE_W / 2 + 40;
    const minY = Math.min(...ys) - 40;
    const maxY = Math.max(...ys) + NODE_H + 40;
    return { svgW: maxX - minX, svgH: maxY - minY, offsetX: -minX, offsetY: -minY };
  }, [positions]);

  const offsetX = useMemo(() => {
    const xs = Object.values(positions).map((p) => p.x);
    if (!xs.length) return 40;
    return -Math.min(...xs) + NODE_W / 2 + 40;
  }, [positions]);
  const offsetY = useMemo(() => {
    const ys = Object.values(positions).map((p) => p.y);
    if (!ys.length) return 40;
    return -Math.min(...ys) + 40;
  }, [positions]);

  // ── Pan handlers ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    if (e.target.closest("[data-node]")) return;
    panRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e) => {
    if (drag) {
      setDrag((d) => ({ ...d, screenX: e.clientX, screenY: e.clientY }));
      return;
    }
    if (!panRef.current) return;
    setPan({ x: e.clientX - panRef.current.startX, y: e.clientY - panRef.current.startY });
  }, [drag]);

  const onMouseUp = useCallback(async (e) => {
    panRef.current = null;
    if (drag && dragOver && dragOver !== drag.node.id && isAdmin) {
      // Reparent: set reporting line
      try {
        const mgr = members.find((m) => m.id === dragOver);
        if (mgr) {
          await api.post(`/api/workspaces/${workspaceId}/org/reporting-lines/`, {
            manager_id: dragOver,
            report_id: drag.node.id,
          });
        }
      } catch (err) {
        console.error("Reparent failed", err);
      }
    }
    setDrag(null);
    setDragOver(null);
  }, [drag, dragOver, isAdmin, members, workspaceId]);

  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.min(2, Math.max(0.3, z + delta)));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // Fit to screen on data load
  useEffect(() => {
    if (!nodes.length || !containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = clientWidth / (svgW + 80);
    const scaleY = clientHeight / (svgH + 80);
    const newZoom = Math.min(1, Math.min(scaleX, scaleY));
    setZoom(newZoom);
    setPan({
      x: (clientWidth - svgW * newZoom) / 2,
      y: (clientHeight - svgH * newZoom) / 2,
    });
  }, [nodes.length, svgW, svgH]);

  const collapseAll = () => {
    const allWithChildren = Object.values(positions)
      .filter((p) => p.node.children?.length > 0)
      .map((p) => p.node.id);
    setCollapsed(new Set(allWithChildren));
  };

  const expandAll = () => setCollapsed(new Set());

  const fitToScreen = () => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = clientWidth / (svgW + 80);
    const scaleY = clientHeight / (svgH + 80);
    const newZoom = Math.min(1, Math.min(scaleX, scaleY));
    setZoom(newZoom);
    setPan({
      x: (clientWidth - svgW * newZoom) / 2,
      y: (clientHeight - svgH * newZoom) / 2,
    });
  };

  if (isLoading) return <Loader className="h-64" />;

  if (!nodes.length) {
    return (
      <div className="p-8">
        <EmptyState
          illustration="members"
          title="No people yet"
          description="Invite members and assign them to departments to see them here."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-1">
          <h1 className="text-sm font-semibold mr-3">Org Chart</h1>
          {/* View mode toggle */}
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("hierarchy")}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium", viewMode === "hierarchy" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Hierarchy
            </button>
            <button
              onClick={() => setViewMode("department")}
              className={cn("flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium", viewMode === "department" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <Building2 className="w-3.5 h-3.5" />
              By Department
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {viewMode === "hierarchy" && (
            <>
              <button onClick={collapseAll} className="text-xs px-2.5 py-1.5 rounded hover:bg-accent text-muted-foreground">Collapse all</button>
              <button onClick={expandAll} className="text-xs px-2.5 py-1.5 rounded hover:bg-accent text-muted-foreground">Expand all</button>
              <div className="w-px h-4 bg-border mx-1" />
            </>
          )}
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.15))} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Zoom in">
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Zoom out">
            <ZoomOut className="w-4 h-4" />
          </button>
          <button onClick={fitToScreen} className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Fit to screen">
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <span className="text-xs text-muted-foreground">{nodes.length} people</span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-muted/20"
        style={{ cursor: drag ? "grabbing" : panRef.current ? "grabbing" : "grab" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg
          ref={svgRef}
          width={svgW}
          height={svgH}
          style={{
            position: "absolute",
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            userSelect: "none",
          }}
        >
          {/* Department rects (dept view) */}
          {viewMode === "department" && deptRects?.map(({ dept, x, y, w, h }) => (
            <g key={dept.id}>
              <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={10}
                fill={dept.color + "12"}
                stroke={dept.color + "44"}
                strokeWidth={1.5}
              />
              <text
                x={x + 16}
                y={y + 22}
                fontSize={11}
                fontWeight={600}
                fill={dept.color}
              >
                {dept.name}
              </text>
            </g>
          ))}

          {/* Edges */}
          {edges.map((edge) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            return (
              <Edge
                key={`${edge.from}-${edge.to}`}
                fromPos={from ? { x: from.x + offsetX, y: from.y + offsetY } : null}
                toPos={to ? { x: to.x + offsetX, y: to.y + offsetY } : null}
              />
            );
          })}

          {/* Nodes */}
          {Object.values(positions).map(({ x, y, node }) => (
            <OrgNode
              key={node.id}
              node={node}
              x={x + offsetX}
              y={y + offsetY}
              zoom={zoom}
              isSelected={selectedNode?.id === node.id || dragOver === node.id}
              collapsed={collapsed}
              onToggle={toggleCollapse}
              isAdmin={isAdmin}
              onSelect={(n) => {
                setSelectedNode((prev) => (prev?.id === n.id ? null : n));
              }}
              onDragStart={(e, n) => {
                e.stopPropagation();
                setDrag({ node: n, screenX: e.clientX, screenY: e.clientY });
                setSelectedNode(null);
              }}
            />
          ))}
        </svg>

        {/* Dot grid background */}
        <svg className="absolute inset-0 pointer-events-none" width="100%" height="100%">
          <defs>
            <pattern id="dot-grid" x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)} width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse">
              <circle cx={1} cy={1} r={0.8} fill="hsl(var(--border))" opacity={0.5} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-grid)" />
        </svg>

        {/* Profile popover */}
        {selectedNode && !selectedNode.virtual && (
          <NodePopover
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            isAdmin={isAdmin}
            workspaceId={workspaceId}
            members={members}
          />
        )}

        {/* Drag overlay */}
        {drag && <DragOverlay node={drag.node} x={drag.screenX} y={drag.screenY} />}

        {/* Admin hint */}
        {isAdmin && viewMode === "hierarchy" && (
          <div className="absolute bottom-4 left-4 text-[10px] text-muted-foreground/60 bg-card/80 border rounded px-2 py-1">
            Drag a node onto another to change their reporting line
          </div>
        )}
      </div>
    </div>
  );
}
