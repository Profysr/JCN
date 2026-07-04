import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ZoomIn, ZoomOut, Maximize2, GitBranch, Building2 } from "lucide-react";
import { Loader } from "@/shared/components/ui/Loader";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { cn } from "@/shared/lib/utils";
import {
  useOrgChart,
  useDeleteReportingLine,
  useDepartments,
  chartReportsKey,
  fetchChartReports,
  deptChartKey,
  fetchDepartmentChartMembers,
  unassignedChartKey,
  fetchUnassignedChartMembers,
} from "@/apps/org-structure/hooks/useOrg";
import { useMembers } from "@/shared/hooks/useMembers";
import { usePermission } from "@/contexts/PermissionsContext";
import api from "@/shared/lib/api";
import {
  buildTree,
  layoutTree,
  buildLazyDeptLayout,
  computeChartBounds,
} from "@/apps/org-structure/components/orgChartLayout";
import {
  OrgNode,
  Edge,
  DeptHeader,
  NodePopover,
  DragOverlay,
} from "@/apps/org-structure/components/OrgChartNodes";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OrgChartPage() {
  const { workspaceId } = useParams();
  const { data, isLoading } = useOrgChart(workspaceId);
  const { data: departments = [] } = useDepartments(workspaceId);
  const { data: members = [] } = useMembers(workspaceId);
  const { isOwner, can } = usePermission();
  const qc = useQueryClient();
  const deleteReportingLine = useDeleteReportingLine(workspaceId);
  const roots = data?.nodes ?? [];

  const isAdmin = isOwner || can("org.manage");

  // View mode: "hierarchy" | "department"
  const [viewMode, setViewMode] = useState("hierarchy");

  // ── Lazy expansion state (hierarchy view) ──────────────────────────────────
  const [expanded, setExpanded] = useState(new Set());
  const [childrenByNode, setChildrenByNode] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());

  const resetHierarchyState = useCallback(() => {
    setExpanded(new Set());
    setChildrenByNode({});
  }, []);

  const toggleNode = useCallback(
    async (nodeId) => {
      if (expanded.has(nodeId)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
        return;
      }
      setExpanded((prev) => new Set(prev).add(nodeId));
      if (childrenByNode[nodeId]) return;
      setLoadingNodes((prev) => new Set(prev).add(nodeId));
      try {
        const result = await qc.fetchQuery({
          queryKey: chartReportsKey(workspaceId, nodeId),
          queryFn: () => fetchChartReports(workspaceId, nodeId),
          staleTime: 5 * 60 * 1000,
        });
        setChildrenByNode((prev) => ({ ...prev, [nodeId]: result.nodes }));
      } catch (err) {
        console.error("Failed to load direct reports", err);
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      } finally {
        setLoadingNodes((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [expanded, childrenByNode, qc, workspaceId],
  );

  const collapseAll = () => setExpanded(new Set());

  // ── Lazy expansion state (department view) ─────────────────────────────────
  const [deptExpanded, setDeptExpanded] = useState(new Set());
  const [membersByDept, setMembersByDept] = useState({});
  const [deptLoading, setDeptLoading] = useState(new Set());
  const [unassignedExpanded, setUnassignedExpanded] = useState(false);
  const [unassignedMembers, setUnassignedMembers] = useState(null);

  const toggleDept = useCallback(
    async (deptId) => {
      if (deptId === "__unassigned__") {
        if (unassignedExpanded) {
          setUnassignedExpanded(false);
          return;
        }
        setUnassignedExpanded(true);
        if (unassignedMembers) return;
        setDeptLoading((prev) => new Set(prev).add(deptId));
        try {
          const result = await qc.fetchQuery({
            queryKey: unassignedChartKey(workspaceId),
            queryFn: () => fetchUnassignedChartMembers(workspaceId),
            staleTime: 5 * 60 * 1000,
          });
          setUnassignedMembers(result.nodes);
        } catch (err) {
          console.error("Failed to load unassigned members", err);
          setUnassignedExpanded(false);
        } finally {
          setDeptLoading((prev) => {
            const next = new Set(prev);
            next.delete(deptId);
            return next;
          });
        }
        return;
      }

      if (deptExpanded.has(deptId)) {
        setDeptExpanded((prev) => {
          const next = new Set(prev);
          next.delete(deptId);
          return next;
        });
        return;
      }
      setDeptExpanded((prev) => new Set(prev).add(deptId));
      if (membersByDept[deptId]) return;
      setDeptLoading((prev) => new Set(prev).add(deptId));
      try {
        const result = await qc.fetchQuery({
          queryKey: deptChartKey(workspaceId, deptId),
          queryFn: () => fetchDepartmentChartMembers(workspaceId, deptId),
          staleTime: 5 * 60 * 1000,
        });
        setMembersByDept((prev) => ({ ...prev, [deptId]: result.nodes }));
      } catch (err) {
        console.error("Failed to load department members", err);
        setDeptExpanded((prev) => {
          const next = new Set(prev);
          next.delete(deptId);
          return next;
        });
      } finally {
        setDeptLoading((prev) => {
          const next = new Set(prev);
          next.delete(deptId);
          return next;
        });
      }
    },
    [
      deptExpanded,
      membersByDept,
      unassignedExpanded,
      unassignedMembers,
      qc,
      workspaceId,
    ],
  );

  const handleRemoveManager = useCallback(
    async (node) => {
      if (!node.reporting_line_id) return;
      try {
        await deleteReportingLine.mutateAsync(node.reporting_line_id);
        resetHierarchyState();
        setSelectedNode(null);
      } catch (err) {
        console.error("Remove manager failed", err);
      }
    },
    [deleteReportingLine, resetHierarchyState],
  );

  // Pan / zoom state
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // Selected / popover node
  const [selectedNode, setSelectedNode] = useState(null);

  // Drag state (reparent)
  const [drag, setDrag] = useState(null); // { node, screenX, screenY }
  const [dragOver, setDragOver] = useState(null); // target node id

  // ── Layout computation ────────────────────────────────────────────────────
  const { positions, edges, deptRects } = useMemo(() => {
    if (viewMode === "department") {
      const groups = departments.map((d) => ({
        dept: d,
        members: deptExpanded.has(d.id) ? membersByDept[d.id] || [] : null,
        memberCount: d.member_count,
        loading: deptLoading.has(d.id),
      }));
      groups.push({
        dept: { id: "__unassigned__", name: "Unassigned", color: "#94a3b8" },
        members: unassignedExpanded ? unassignedMembers || [] : null,
        memberCount: null,
        loading: deptLoading.has("__unassigned__"),
      });
      return buildLazyDeptLayout(groups);
    }
    if (!roots.length) return { positions: {}, edges: [], deptRects: [] };
    const tree = buildTree(roots, expanded, childrenByNode);
    const { positions, edges } = layoutTree(tree);
    return { positions, edges, deptRects: [] };
  }, [
    roots,
    expanded,
    childrenByNode,
    viewMode,
    departments,
    deptExpanded,
    membersByDept,
    deptLoading,
    unassignedExpanded,
    unassignedMembers,
  ]);

  const { svgW, svgH, offsetX, offsetY } = useMemo(
    () => computeChartBounds(positions, deptRects),
    [positions, deptRects],
  );

  // ── Pan handlers ──────────────────────────────────────────────────────────
  const onMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("[data-node]")) return;
      panRef.current = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
    },
    [pan],
  );

  const onMouseMove = useCallback(
    (e) => {
      if (drag) {
        setDrag((d) => ({ ...d, screenX: e.clientX, screenY: e.clientY }));
        return;
      }
      if (!panRef.current) return;
      setPan({
        x: e.clientX - panRef.current.startX,
        y: e.clientY - panRef.current.startY,
      });
    },
    [drag],
  );

  const onMouseUp = useCallback(
    async (_e) => {
      panRef.current = null;
      if (drag && dragOver && dragOver !== drag.node.id && isAdmin) {
        try {
          const mgr = members.find((m) => m.id === dragOver);
          if (mgr) {
            await api.post(
              `/api/workspaces/${workspaceId}/org/reporting-lines/`,
              {
                manager_id: dragOver,
                report_id: drag.node.id,
              },
            );
            qc.invalidateQueries({ queryKey: ["org-chart", workspaceId] });
            resetHierarchyState();
          }
        } catch (err) {
          console.error("Reparent failed", err);
        }
      }
      setDrag(null);
      setDragOver(null);
    },
    [drag, dragOver, isAdmin, members, workspaceId, qc, resetHierarchyState],
  );

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
    if ((!roots.length && viewMode === "hierarchy") || !containerRef.current)
      return;
    const { clientWidth, clientHeight } = containerRef.current;
    const scaleX = clientWidth / (svgW + 80);
    const scaleY = clientHeight / (svgH + 80);
    const newZoom = Math.min(1, Math.min(scaleX, scaleY));
    setZoom(newZoom);
    setPan({
      x: (clientWidth - svgW * newZoom) / 2,
      y: (clientHeight - svgH * newZoom) / 2,
    });
  }, [roots.length, svgW, svgH, viewMode]);

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

  if (!roots.length && viewMode === "hierarchy") {
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
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
                viewMode === "hierarchy"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Hierarchy
            </button>
            <button
              onClick={() => setViewMode("department")}
              className={cn(
                "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
                viewMode === "department"
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Building2 className="w-3.5 h-3.5" />
              By Department
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {viewMode === "hierarchy" && (
            <>
              <button
                onClick={collapseAll}
                className="text-xs px-2.5 py-1.5 rounded hover:bg-accent text-muted-foreground"
              >
                Collapse all
              </button>
              <div className="w-px h-4 bg-border mx-1" />
            </>
          )}
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.15))}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="p-1.5 rounded hover:bg-accent text-muted-foreground"
            title="Fit to screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <span className="text-xs text-muted-foreground">
            {Object.keys(positions).length} shown
          </span>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-muted/20"
        style={{
          cursor: drag ? "grabbing" : panRef.current ? "grabbing" : "grab",
        }}
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
          {viewMode === "department" &&
            deptRects?.map(
              ({
                dept,
                x,
                y,
                w,
                h,
                expanded: deptIsExpanded,
                memberCount,
                loading,
                empty,
              }) => (
                <g key={dept.id}>
                  <rect
                    x={x + offsetX}
                    y={y + offsetY}
                    width={w}
                    height={h}
                    rx={10}
                    fill={dept.color + "12"}
                    stroke={dept.color + "44"}
                    strokeWidth={1.5}
                  />
                  <DeptHeader
                    dept={dept}
                    x={x + offsetX}
                    y={y + offsetY}
                    w={w}
                    expanded={deptIsExpanded}
                    memberCount={memberCount}
                    loading={loading}
                    onToggle={toggleDept}
                  />
                  {deptIsExpanded && empty && (
                    <foreignObject
                      x={x + offsetX}
                      y={y + offsetY + 36}
                      width={w}
                      height={h - 36}
                    >
                      <div className="flex items-center justify-center h-full text-[11px] text-muted-foreground/60">
                        No members
                      </div>
                    </foreignObject>
                  )}
                </g>
              ),
            )}

          {/* Edges */}
          {edges.map((edge) => {
            const from = positions[edge.from];
            const to = positions[edge.to];
            return (
              <Edge
                key={`${edge.from}-${edge.to}`}
                fromPos={
                  from ? { x: from.x + offsetX, y: from.y + offsetY } : null
                }
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
              isExpanded={expanded.has(node.id)}
              isLoading={loadingNodes.has(node.id)}
              onToggle={toggleNode}
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
        <svg
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
        >
          <defs>
            <pattern
              id="dot-grid"
              x={pan.x % (20 * zoom)}
              y={pan.y % (20 * zoom)}
              width={20 * zoom}
              height={20 * zoom}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={1}
                cy={1}
                r={0.8}
                fill="hsl(var(--border))"
                opacity={0.5}
              />
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
            onRemoveManager={handleRemoveManager}
          />
        )}

        {/* Drag overlay */}
        {drag && (
          <DragOverlay node={drag.node} x={drag.screenX} y={drag.screenY} />
        )}

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
