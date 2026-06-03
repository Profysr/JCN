import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useUpdateSprint } from "@/hooks/useSprints";
import { cn } from "@/lib/utils";

// ── Layout constants ──────────────────────────────────────────────────────────
const LEFT_W        = 220;   // project + sprint name column
const SPRINT_H      = 36;    // height of each sprint bar row
const PRJ_HDR_H     = 28;    // project name header row
const HDR_H         = 48;    // date header (year row + month row)
const PX_PER_DAY    = 14;    // default: month-zoom
const EDGE_ZONE     = 60;    // px from edge that triggers auto-scroll
const MAX_SPEED     = 12;    // max auto-scroll px/frame

const MONTHS  = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS  = ["#6366f1","#ec4899","#f59e0b","#22c55e","#3b82f6","#8b5cf6","#14b8a6","#ef4444"];

// ── Date helpers ──────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function computeRange(allSprints) {
  const dates = allSprints.flatMap(s => [parseDate(s.start_date), parseDate(s.end_date)]).filter(Boolean);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (dates.length === 0) return { start: addDays(today, -30), end: addDays(today, 120) };
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  return { start: addDays(min, -14), end: addDays(max, 90) };
}

function buildHeader(rangeStart, rangeEnd, pxPerDay) {
  const total = daysBetween(rangeStart, rangeEnd);
  const top = [], bottom = [];
  let yearStart = -1, yearX = 0;
  let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (m <= rangeEnd) {
    const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const sx = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
    const w  = daysBetween(m, next) * pxPerDay;
    bottom.push({ label: MONTHS[m.getMonth()], x: sx, w });
    if (m.getFullYear() !== yearStart) {
      if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: sx - yearX });
      yearStart = m.getFullYear(); yearX = sx;
    }
    m = next;
  }
  if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: total * pxPerDay - yearX });
  return { top, bottom };
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const { workspaceSlug } = useParams();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/`).then(r => r.data),
    enabled: !!workspaceSlug,
  });

  // Fetch sprints for every project in parallel
  const sprintResults = useQueries({
    queries: projects.map(p => ({
      queryKey: ["sprints", workspaceSlug, p.id],
      queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${p.id}/sprints/`).then(r => r.data),
      enabled: !!workspaceSlug && projects.length > 0,
    })),
  });

  // Map project → its sprints
  const sprintsByProject = useMemo(() =>
    projects.reduce((acc, p, i) => {
      acc[p.id] = (sprintResults[i]?.data || []).filter(s => s.start_date && s.end_date);
      return acc;
    }, {}),
  [projects, sprintResults]);

  const allSprints = useMemo(() => Object.values(sprintsByProject).flat(), [sprintsByProject]);

  // ── Shared timeline state ──────────────────────────────────────────────────
  const [dragPreview, setDragPreview] = useState(null);
  // { sprintId, projectId, type: "move"|"resize", deltaDays }

  const { start: baseRangeStart, end: baseRangeEnd } = useMemo(() => computeRange(allSprints), [allSprints]);

  // Extend range live when dragging past the end
  const rangeEnd = useMemo(() => {
    if (!dragPreview) return baseRangeEnd;
    const sprint = allSprints.find(s => s.id === dragPreview.sprintId);
    if (!sprint) return baseRangeEnd;
    const ref = parseDate(dragPreview.type === "resize" ? (sprint.end_date || sprint.start_date) : (sprint.end_date || sprint.start_date));
    if (!ref) return baseRangeEnd;
    const projected = addDays(ref, dragPreview.deltaDays);
    return projected > baseRangeEnd ? addDays(projected, 90) : baseRangeEnd;
  }, [baseRangeEnd, dragPreview, allSprints]);

  const rangeStart = baseRangeStart;
  const totalDays  = daysBetween(rangeStart, rangeEnd);
  const totalWidth = totalDays * PX_PER_DAY;

  const header = useMemo(() => buildHeader(rangeStart, rangeEnd, PX_PER_DAY), [rangeStart, rangeEnd]);

  // Scroll container — shared for header + all rows
  const rightRef    = useRef(null);
  const leftBodyRef = useRef(null);
  const syncingRef  = useRef(false);

  const onRightScroll = () => {
    if (syncingRef.current || !leftBodyRef.current) return;
    syncingRef.current = true;
    leftBodyRef.current.scrollTop = rightRef.current.scrollTop;
    syncingRef.current = false;
  };
  const onLeftScroll = () => {
    if (syncingRef.current || !rightRef.current) return;
    syncingRef.current = true;
    rightRef.current.scrollTop = leftBodyRef.current.scrollTop;
    syncingRef.current = false;
  };

  // Scroll to today on mount
  useEffect(() => {
    if (!rightRef.current) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const x = daysBetween(rangeStart, today) * PX_PER_DAY;
    rightRef.current.scrollLeft = Math.max(0, x - 200);
  }, [rangeStart]);

  // Today line
  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayX   = daysBetween(rangeStart, today) * PX_PER_DAY;
  const todayVis = todayX >= 0 && todayX <= totalWidth;

  // Compute total left-panel + right-panel height for each project
  const projectLayout = useMemo(() =>
    projects.map(p => {
      const sprints = sprintsByProject[p.id] || [];
      const rows    = sprints.length;
      return { project: p, sprints, totalH: PRJ_HDR_H + rows * SPRINT_H + 8 };
    }),
  [projects, sprintsByProject]);

  const totalBodyH = projectLayout.reduce((sum, pl) => sum + pl.totalH, 0);

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No projects yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="px-6 py-3.5 border-b flex-shrink-0 bg-card/60 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-base">Roadmap</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drag sprint bars to move · drag right edge to resize
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Left panel ── */}
        <div className="flex-shrink-0 flex flex-col border-r border-border bg-card z-10" style={{ width: LEFT_W }}>
          {/* Header spacer */}
          <div className="flex-shrink-0 border-b border-border bg-muted/40" style={{ height: HDR_H }} />
          {/* Project + sprint labels */}
          <div ref={leftBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll}>
            <div className="relative" style={{ height: totalBodyH }}>
              {projectLayout.reduce((acc, pl, pi) => {
                const yOffset = projectLayout.slice(0, pi).reduce((s, l) => s + l.totalH, 0);
                acc.push(
                  // Project name
                  <div key={`p-${pl.project.id}`}
                    className="absolute flex items-center px-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide border-b border-border bg-muted/20"
                    style={{ top: yOffset, height: PRJ_HDR_H, width: LEFT_W - 1 }}>
                    {pl.project.name}
                  </div>
                );
                pl.sprints.forEach((s, si) => {
                  const y = yOffset + PRJ_HDR_H + si * SPRINT_H;
                  acc.push(
                    <div key={`s-${s.id}`}
                      className="absolute flex items-center px-3 gap-2 border-b border-border/50 hover:bg-accent/30 cursor-pointer text-xs"
                      style={{ top: y, height: SPRINT_H, width: LEFT_W - 1 }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[(pi + si) % COLORS.length] }} />
                      <span className="truncate text-foreground">{s.name}</span>
                      <span className={cn("flex-shrink-0 text-[10px] font-medium px-1 py-0.5 rounded",
                        s.status === "active" ? "bg-emerald-500/15 text-emerald-500" :
                        s.status === "completed" ? "bg-muted text-muted-foreground" :
                        "bg-blue-500/15 text-blue-500")}>
                        {s.status}
                      </span>
                    </div>
                  );
                });
                return acc;
              }, [])}
            </div>
          </div>
        </div>

        {/* ── Right panel — single scrollable container ── */}
        <div
          ref={rightRef}
          className="flex-1 overflow-auto"
          onScroll={onRightScroll}
          style={{ cursor: dragPreview ? (dragPreview.type === "resize" ? "ew-resize" : "grabbing") : "default" }}
        >
          {/* Sticky date header */}
          <div className="sticky top-0 z-20 bg-muted/40 border-b border-border" style={{ height: HDR_H, width: totalWidth }}>
            {header.top.map((seg, i) => (
              <div key={i}
                className="absolute top-0 flex items-center px-2 border-r border-border/40 text-[11px] font-semibold text-muted-foreground overflow-hidden"
                style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                {seg.label}
              </div>
            ))}
            {header.bottom.map((seg, i) => (
              <div key={i}
                className="absolute bottom-0 flex items-center justify-center border-r border-border/40 text-[11px] text-muted-foreground font-medium"
                style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                {seg.label}
              </div>
            ))}
          </div>

          {/* Bars area */}
          <div className="relative" style={{ width: totalWidth, height: totalBodyH }}>

            {/* Vertical grid lines */}
            {header.bottom.map((seg, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-r border-border/20" style={{ left: seg.x, width: seg.w }} />
            ))}

            {/* Today line */}
            {todayVis && (
              <div className="absolute top-0 bottom-0 w-px bg-red-400/60 z-10 pointer-events-none" style={{ left: todayX }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-400" />
              </div>
            )}

            {/* Project group bands + sprint bars */}
            {projectLayout.reduce((acc, pl, pi) => {
              const yOffset = projectLayout.slice(0, pi).reduce((s, l) => s + l.totalH, 0);

              // Project header band
              acc.push(
                <div key={`band-${pl.project.id}`}
                  className="absolute left-0 right-0 bg-muted/15 border-b border-border"
                  style={{ top: yOffset, height: PRJ_HDR_H }} />
              );

              // Sprint bars
              pl.sprints.forEach((sprint, si) => {
                const y = yOffset + PRJ_HDR_H + si * SPRINT_H;
                acc.push(
                  <SprintBar
                    key={sprint.id}
                    sprint={sprint}
                    y={y}
                    rangeStart={rangeStart}
                    color={COLORS[(pi + si) % COLORS.length]}
                    dragPreview={dragPreview?.sprintId === sprint.id ? dragPreview : null}
                    onDragStart={(type) => startSprintDrag(sprint, pl.project.id, type, rightRef, setDragPreview)}
                    workspaceSlug={workspaceSlug}
                    projectId={pl.project.id}
                  />
                );
              });

              return acc;
            }, [])}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sprint drag starter (lives outside component to avoid re-creating) ────────
function startSprintDrag(sprint, projectId, type, rightRef, setDragPreview) {
  // Returns a mousedown handler bound to this sprint
  return (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const dragState = {
      sprintId:  sprint.id,
      projectId,
      type,
      startX:    e.clientX,
      origStart: sprint.start_date,
      origEnd:   sprint.end_date,
      lastClientX: e.clientX,
    };

    const rafRef = { current: null };

    const scrollLoop = () => {
      if (!rightRef.current) return;
      const rect      = rightRef.current.getBoundingClientRect();
      const mouseX    = dragState.lastClientX;
      const fromRight = rect.right - mouseX;
      const fromLeft  = mouseX - rect.left;

      let scrollDelta = 0;
      if (fromRight < EDGE_ZONE) scrollDelta =  Math.round((1 - fromRight / EDGE_ZONE) * MAX_SPEED);
      if (fromLeft  < EDGE_ZONE) scrollDelta = -Math.round((1 - fromLeft  / EDGE_ZONE) * MAX_SPEED);

      if (scrollDelta !== 0) {
        rightRef.current.scrollLeft += scrollDelta;
        dragState.startX -= scrollDelta;
      }

      const dx        = dragState.lastClientX - dragState.startX;
      const deltaDays = Math.round(dx / PX_PER_DAY);
      setDragPreview({ sprintId: sprint.id, projectId, type, deltaDays });

      rafRef.current = requestAnimationFrame(scrollLoop);
    };

    rafRef.current = requestAnimationFrame(scrollLoop);

    const onMove = (ev) => { dragState.lastClientX = ev.clientX; };

    const onUp = (ev) => {
      cancelAnimationFrame(rafRef.current);
      setDragPreview(null);

      const dx        = ev.clientX - dragState.startX;
      const deltaDays = Math.round(dx / PX_PER_DAY);

      if (Math.abs(deltaDays) > 0) {
        // Commit is handled by SprintBar via the onCommit callback
        dragState.onCommit?.(deltaDays);
      }

      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };

    dragState.onCommit = null; // will be set by SprintBar
    window._roadmapDragState = dragState; // pass to SprintBar

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  };
}

// ── SprintBar ─────────────────────────────────────────────────────────────────
function SprintBar({ sprint, y, rangeStart, color, dragPreview, onDragStart, workspaceSlug, projectId }) {
  const updateSprint = useUpdateSprint(workspaceSlug, projectId);
  const rafRef       = useRef(null);

  const dd    = dragPreview?.deltaDays ?? 0;
  const dType = dragPreview?.type      ?? "move";

  const startDate = parseDate(sprint.start_date);
  const endDate   = parseDate(sprint.end_date);
  if (!startDate || !endDate) return null;

  const baseX = daysBetween(rangeStart, startDate) * PX_PER_DAY;
  const baseW = Math.max(PX_PER_DAY, daysBetween(startDate, endDate) * PX_PER_DAY);

  const x = dType === "move"   ? baseX + dd * PX_PER_DAY : baseX;
  const w = dType === "resize" ? Math.max(PX_PER_DAY, baseW + dd * PX_PER_DAY) : baseW;

  // Display dates for tooltip
  const previewStart = dType === "move"   ? dateKey(addDays(startDate, dd)) : sprint.start_date;
  const previewEnd   = dType === "resize" ? dateKey(addDays(endDate,   dd)) : (dType === "move" ? dateKey(addDays(endDate, dd)) : sprint.end_date);

  const isDragging = !!dragPreview;

  const handleMouseDown = useCallback((type) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX  = e.clientX;
    const origStart = sprint.start_date;
    const origEnd   = sprint.end_date;

    // We handle commit locally since we have direct access to updateSprint
    const commitFn = (deltaDays) => {
      if (type === "move") {
        updateSprint.mutate({
          sprintId:   sprint.id,
          start_date: dateKey(addDays(parseDate(origStart), deltaDays)),
          end_date:   dateKey(addDays(parseDate(origEnd),   deltaDays)),
        });
      } else {
        const newEnd = addDays(parseDate(origEnd), deltaDays);
        if (newEnd > parseDate(origStart)) {
          updateSprint.mutate({ sprintId: sprint.id, end_date: dateKey(newEnd) });
        }
      }
    };

    // Store commit fn so the global mouseup can call it
    if (window._roadmapDragState) window._roadmapDragState.onCommit = commitFn;

    // Trigger the parent's drag starter
    onDragStart(type)(e);
  }, [sprint, updateSprint, onDragStart]);

  const opacity = sprint.status === "planning" ? 0.6 : sprint.status === "completed" ? 0.7 : 1;

  return (
    <div
      className="absolute group"
      style={{ top: y, height: SPRINT_H, left: Math.max(0, x), width: w }}
    >
      {/* Bar */}
      <div
        className={cn(
          "absolute inset-y-2 rounded-md flex items-center overflow-hidden select-none",
          isDragging ? "shadow-lg ring-2 ring-white/30" : "cursor-grab hover:brightness-110",
        )}
        style={{
          left:            0,
          width:           w,
          backgroundColor: color,
          opacity,
          // Only animate when NOT dragging (snapping back after commit)
          transition: isDragging ? "none" : "left 120ms ease, width 120ms ease",
        }}
        onMouseDown={handleMouseDown("move")}
      >
        <span className="flex-1 truncate px-2.5 text-[11px] font-semibold text-white pointer-events-none leading-none">
          {sprint.name}
        </span>
        <span className="text-white/70 text-[10px] pr-5 flex-shrink-0 pointer-events-none">
          {sprint.completed_count ?? 0}/{sprint.task_count ?? 0}
        </span>

        {/* Resize handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-3.5 flex items-center justify-center gap-0.5 cursor-col-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown("resize")(e); }}
        >
          <div className="w-px h-3.5 bg-white/60 rounded-full" />
          <div className="w-px h-3.5 bg-white/60 rounded-full" />
        </div>
      </div>

      {/* Live date tooltip while dragging */}
      {isDragging && (
        <div className="absolute -top-6 left-0 bg-foreground text-background text-[10px] font-semibold px-2 py-0.5 rounded shadow-md whitespace-nowrap z-30 pointer-events-none">
          {previewStart} → {previewEnd}
        </div>
      )}
    </div>
  );
}
