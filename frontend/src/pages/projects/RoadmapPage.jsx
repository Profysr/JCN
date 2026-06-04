import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useUpdateSprint } from "@/hooks/useSprints";
import { cn } from "@/lib/utils";
import { getSprintStatus } from "@/lib/constants";

// ── Constants ─────────────────────────────────────────────────────────────────
const LEFT_W         = 220;
const SPRINT_H       = 40;
const PRJ_HDR_H      = 30;
const HDR_H          = 52;
const EDGE_ZONE      = 60;
const MAX_SPEED      = 12;
const DRAG_THRESHOLD = 4;

// Zoom levels — Day omitted: sprint-level view is too wide at 44px/day
const ZOOM_PX = { week: 20, month: 10, quarter: 4 };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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

function computeRange(sprints) {
  const dates = sprints.flatMap(s => [parseDate(s.start_date), parseDate(s.end_date)]).filter(Boolean);
  const today = new Date(); today.setHours(0,0,0,0);
  if (!dates.length) return { start: addDays(today, -30), end: addDays(today, 120) };
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  return { start: addDays(min, -14), end: addDays(max, 90) };
}

function buildHeader(rangeStart, rangeEnd, pxPerDay, zoom) {
  const total = daysBetween(rangeStart, rangeEnd);
  const now   = new Date();
  const top = [], bottom = [];

  if (zoom === "week") {
    // top: months  bottom: week-start dates
    let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (m <= rangeEnd) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const sx = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
      const ex = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
      if (ex > sx) top.push({ label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}`, x: sx, w: ex - sx });
      m = next;
    }
    let ws = new Date(rangeStart); ws.setDate(ws.getDate() - ws.getDay());
    const nowM = now.getMonth(), nowY = now.getFullYear();
    while (ws <= rangeEnd) {
      const x      = Math.max(0, daysBetween(rangeStart, ws)) * pxPerDay;
      const ref    = ws < rangeStart ? rangeStart : ws;
      const wsEnd  = addDays(ws, 6);
      const isCur  = (ref.getMonth() === nowM && ref.getFullYear() === nowY)
                  || (wsEnd.getMonth() === nowM && wsEnd.getFullYear() === nowY);
      bottom.push({ label: `${MONTHS[ref.getMonth()]} ${ref.getDate()}`, x, w: 7 * pxPerDay, current: isCur, monthBoundary: ref.getDate() <= 7 });
      ws = addDays(ws, 7);
    }
    return { top, bottom };
  }

  const nowM = now.getMonth(), nowY = now.getFullYear();

  if (zoom === "quarter") {
    let yearStart = -1, yearX = 0;
    let q = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1);
    while (q <= rangeEnd) {
      const next  = new Date(q.getFullYear(), q.getMonth() + 3, 1);
      const sx    = Math.max(0, daysBetween(rangeStart, q)) * pxPerDay;
      const ex    = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
      const qEnd  = addDays(next, -1);
      const isCur = q.getFullYear() === nowY && q.getMonth() <= nowM && qEnd.getMonth() >= nowM;
      bottom.push({ label: `Q${Math.floor(q.getMonth()/3)+1}`, x: sx, w: ex - sx, current: isCur, monthBoundary: true });
      if (q.getFullYear() !== yearStart) {
        if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: sx - yearX });
        yearStart = q.getFullYear(); yearX = sx;
      }
      q = next;
    }
    top.push({ label: String(yearStart), x: yearX, w: total * pxPerDay - yearX });
    return { top, bottom };
  }

  // month (default)
  let yearStart = -1, yearX = 0;
  let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (m <= rangeEnd) {
    const next  = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    const sx    = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
    const w     = daysBetween(m, next) * pxPerDay;
    const isCur = m.getMonth() === nowM && m.getFullYear() === nowY;
    bottom.push({ label: MONTHS[m.getMonth()], x: sx, w, current: isCur, monthBoundary: true });
    if (m.getFullYear() !== yearStart) {
      if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: sx - yearX });
      yearStart = m.getFullYear(); yearX = sx;
    }
    m = next;
  }
  if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: total * pxPerDay - yearX });
  return { top, bottom };
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  const { workspaceSlug } = useParams();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", workspaceSlug],
    queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/`).then(r => r.data),
    enabled: !!workspaceSlug,
  });

  const sprintResults = useQueries({
    queries: projects.map(p => ({
      queryKey: ["sprints", workspaceSlug, p.id],
      queryFn: () => api.get(`/api/workspaces/${workspaceSlug}/projects/${p.id}/sprints/`).then(r => r.data),
      enabled: !!workspaceSlug && projects.length > 0,
    })),
  });

  const sprintsByProject = useMemo(() =>
    projects.reduce((acc, p, i) => {
      acc[p.id] = (sprintResults[i]?.data || []).filter(s => s.start_date && s.end_date);
      return acc;
    }, {}),
  [projects, sprintResults]);

  const allSprints = useMemo(() => Object.values(sprintsByProject).flat(), [sprintsByProject]);

  const [zoom, setZoom] = useState("week");
  const [dragPreview, setDragPreview] = useState(null);

  const pxPerDay = ZOOM_PX[zoom];

  const { start: baseStart, end: baseEnd } = useMemo(() => computeRange(allSprints), [allSprints]);

  // Extend canvas when drag preview goes past the current end
  const rangeEnd = useMemo(() => {
    if (!dragPreview) return baseEnd;
    const s = allSprints.find(sp => sp.id === dragPreview.sprintId);
    if (!s) return baseEnd;
    const ref = parseDate(s.end_date || s.start_date);
    if (!ref) return baseEnd;
    const projected = addDays(ref, dragPreview.deltaDays);
    return projected > baseEnd ? addDays(projected, 90) : baseEnd;
  }, [baseEnd, dragPreview, allSprints]);

  const rangeStart = baseStart;
  const totalDays  = daysBetween(rangeStart, rangeEnd);
  const totalWidth = totalDays * pxPerDay;
  const header     = useMemo(() => buildHeader(rangeStart, rangeEnd, pxPerDay, zoom), [rangeStart, rangeEnd, pxPerDay, zoom]);

  const rightRef    = useRef(null);
  const leftBodyRef = useRef(null);
  const syncRef     = useRef(false);

  const onRightScroll = () => {
    if (syncRef.current || !leftBodyRef.current) return;
    syncRef.current = true;
    leftBodyRef.current.scrollTop = rightRef.current.scrollTop;
    syncRef.current = false;
  };
  const onLeftScroll = () => {
    if (syncRef.current || !rightRef.current) return;
    syncRef.current = true;
    rightRef.current.scrollTop = leftBodyRef.current.scrollTop;
    syncRef.current = false;
  };

  const scrollToToday = useCallback(() => {
    if (!rightRef.current) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const x = daysBetween(rangeStart, today) * pxPerDay;
    rightRef.current.scrollLeft = Math.max(0, x - 260);
  }, [rangeStart, pxPerDay]);

  // On mount: scroll to today once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { scrollToToday(); }, []);

  // On zoom change: re-center on today so the new scale makes sense
  useEffect(() => { scrollToToday(); }, [zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayX   = daysBetween(rangeStart, today) * pxPerDay;
  const todayVis = todayX >= 0 && todayX <= totalWidth;

  const projectLayout = useMemo(() =>
    projects.map(p => {
      const sprints = sprintsByProject[p.id] || [];
      return { project: p, sprints, totalH: PRJ_HDR_H + sprints.length * SPRINT_H };
    }),
  [projects, sprintsByProject]);

  const totalBodyH = projectLayout.reduce((s, pl) => s + pl.totalH + 8, 0);

  if (projects.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No projects yet.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-3 border-b flex-shrink-0 bg-card/60 flex items-center gap-4">
        <div className="flex-1">
          <h1 className="font-bold text-base">Roadmap</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sprint timeline across all projects · drag to move · drag right edge to extend
          </p>
        </div>

        {/* Zoom switcher */}
        <div className="flex items-center bg-muted rounded-lg p-0.5">
          {Object.keys(ZOOM_PX).map(z => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={cn(
                "px-2.5 py-1 rounded-md capitalize text-xs font-medium transition-colors",
                zoom === z ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {z}
            </button>
          ))}
        </div>

        {/* Today */}
        <button
          onClick={scrollToToday}
          className="px-2.5 py-1 text-xs font-medium rounded border border-border hover:bg-accent transition-colors"
        >
          Today
        </button>
      </div>

      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left panel */}
        <div className="flex-shrink-0 flex flex-col border-r border-border bg-card z-10 shadow-sm" style={{ width: LEFT_W }}>
          <div className="flex-shrink-0 border-b border-border bg-muted/40" style={{ height: HDR_H }} />
          <div ref={leftBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll}>
            <div className="relative" style={{ height: totalBodyH }}>
              {(() => {
                let y = 0;
                return projectLayout.map(({ project, sprints, totalH }) => {
                  const yStart = y;
                  y += totalH + 8;
                  return (
                    <div key={project.id}>
                      {/* Project name row */}
                      <div
                        className="absolute flex items-center px-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border"
                        style={{ top: yStart, height: PRJ_HDR_H, width: LEFT_W - 1 }}
                      >
                        {project.name}
                      </div>
                      {/* Sprint label rows */}
                      {sprints.map((s, si) => (
                        <div key={s.id}
                          className="absolute flex items-center gap-2 px-3 border-b border-border/40 text-xs"
                          style={{ top: yStart + PRJ_HDR_H + si * SPRINT_H, height: SPRINT_H, width: LEFT_W - 1 }}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[(sprints.indexOf(s)) % COLORS.length] }} />
                          <span className="truncate flex-1 text-foreground">{s.name}</span>
                          <StatusChip status={s.status} />
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* Right: unified scroll container */}
        <div
          ref={rightRef}
          className="flex-1 overflow-auto"
          onScroll={onRightScroll}
        >
          {/* Sticky date header */}
          <div
            className="sticky top-0 z-20 border-b border-border bg-muted/50 backdrop-blur-sm"
            style={{ height: HDR_H, width: totalWidth, minWidth: "100%" }}
          >
            <div className="relative h-full" style={{ width: totalWidth }}>
              {header.top.map((seg, i) => (
                <div key={i}
                  className="absolute top-0 flex items-center px-2 border-r border-border/40 text-[11px] font-bold text-muted-foreground overflow-hidden"
                  style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                  {seg.label}
                </div>
              ))}
              {header.bottom.map((seg, i) => (
                <div key={i}
                  className={cn(
                    "absolute bottom-0 flex items-center justify-center border-r border-border/30 text-[11px]",
                    seg.current ? "text-primary font-semibold" : "text-muted-foreground",
                  )}
                  style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                  {seg.label}
                </div>
              ))}
            </div>
          </div>

          {/* Bars canvas */}
          <div className="relative" style={{ width: totalWidth, height: totalBodyH, minWidth: "100%" }}>
            {/* Current-period shading */}
            {header.bottom.filter(seg => seg.current).map((seg, i) => (
              <div
                key={`cur-${i}`}
                className="absolute top-0 bottom-0 bg-primary/10 pointer-events-none"
                style={{ left: seg.x, width: seg.w }}
              />
            ))}

            {/* Vertical grid lines — month boundaries stronger than inner lines */}
            {header.bottom.map((seg, i) => (
              <div
                key={i}
                className={seg.monthBoundary
                  ? "absolute top-0 bottom-0 border-r border-border/70"
                  : "absolute top-0 bottom-0 border-r border-border/35"}
                style={{ left: seg.x }}
              />
            ))}

            {/* Today line */}
            {todayVis && (
              <div className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10 pointer-events-none" style={{ left: todayX }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-400" />
              </div>
            )}

            {/* Sprint bars */}
            {(() => {
              let y = 0;
              return projectLayout.map(({ project, sprints, totalH }, pi) => {
                const yStart = y;
                y += totalH + 8;
                return (
                  <div key={project.id}>
                    {/* Project band */}
                    <div
                      className="absolute left-0 bg-muted/10 border-b border-border/30"
                      style={{ top: yStart, height: PRJ_HDR_H, width: totalWidth }}
                    />
                    {sprints.map((sprint, si) => (
                      <SprintBar
                        key={sprint.id}
                        sprint={sprint}
                        y={yStart + PRJ_HDR_H + si * SPRINT_H}
                        rangeStart={rangeStart}
                        pxPerDay={pxPerDay}
                        color={COLORS[si % COLORS.length]}
                        dragPreview={dragPreview?.sprintId === sprint.id ? dragPreview : null}
                        setDragPreview={setDragPreview}
                        rightRef={rightRef}
                        workspaceSlug={workspaceSlug}
                        projectId={project.id}
                      />
                    ))}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────
function StatusChip({ status }) {
  const s = getSprintStatus(status);
  return (
    <span className={cn("flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border", s.badgeCls)}>
      {s.label}
    </span>
  );
}

// ── SprintBar ─────────────────────────────────────────────────────────────────
function SprintBar({ sprint, y, rangeStart, pxPerDay, color, dragPreview, setDragPreview, rightRef, workspaceSlug, projectId }) {
  const updateSprint  = useUpdateSprint(workspaceSlug, projectId);
  const dragRef       = useRef(null);
  const rafRef        = useRef(null);
  const didDragRef    = useRef(false);
  const [hovered, setHovered] = useState(false);

  // Cleanup on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const startDate = parseDate(sprint.start_date);
  const endDate   = parseDate(sprint.end_date);
  if (!startDate || !endDate) return null;

  const baseX = daysBetween(rangeStart, startDate) * pxPerDay;
  const baseW = Math.max(pxPerDay, daysBetween(startDate, endDate) * pxPerDay);

  // Apply drag preview
  const dd    = dragPreview?.deltaDays ?? 0;
  const dType = dragPreview?.type ?? "move";
  const x = dType === "move"   ? baseX + dd * pxPerDay : baseX;
  const w = dType === "resize" ? Math.max(pxPerDay, baseW + dd * pxPerDay) : baseW;

  const isDragging = !!dragPreview;

  // Live dates for tooltip
  const previewStart = dType === "move"   ? dateKey(addDays(startDate, dd)) : sprint.start_date;
  const previewEnd   = dType === "resize" ? dateKey(addDays(endDate,   dd)) : (dType === "move" ? dateKey(addDays(endDate, dd)) : sprint.end_date);

  // Progress fill (completed tasks / total)
  const total     = sprint.task_count      || 0;
  const completed = sprint.completed_count || 0;
  const pct       = total > 0 ? Math.round(completed / total * 100) : 0;

  const opacity = sprint.status === "completed" ? 0.65 : sprint.status === "planning" ? 0.7 : 1;

  const startDrag = useCallback((type) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    didDragRef.current = false;
    dragRef.current = {
      type,
      startX:      e.clientX,
      lastClientX: e.clientX,
      origStart:   sprint.start_date,
      origEnd:     sprint.end_date,
    };

    const loop = () => {
      if (!dragRef.current) return;

      const dx = dragRef.current.lastClientX - dragRef.current.startX;

      // Only activate scroll + preview once mouse has crossed the movement threshold.
      // Without this gate the loop fires on the initial click and auto-scrolls to
      // the edge if the bar happens to be near the viewport boundary (jumps to "today").
      if (Math.abs(dx) > DRAG_THRESHOLD) {
        didDragRef.current = true;

        // Edge auto-scroll
        const rc     = rightRef.current?.getBoundingClientRect();
        const mouseX = dragRef.current.lastClientX;
        if (rc && rightRef.current) {
          let vel = 0;
          if (rc.right - mouseX < EDGE_ZONE) vel =  Math.round((1 - (rc.right - mouseX) / EDGE_ZONE) * MAX_SPEED);
          if (mouseX - rc.left  < EDGE_ZONE) vel = -Math.round((1 - (mouseX - rc.left)  / EDGE_ZONE) * MAX_SPEED);
          if (vel !== 0) {
            rightRef.current.scrollLeft += vel;
            dragRef.current.startX      -= vel;
          }
        }

        const deltaDays = Math.round(dx / pxPerDay);
        setDragPreview({ sprintId: sprint.id, type, deltaDays });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onMove = (ev) => {
      if (!dragRef.current) return;
      dragRef.current.lastClientX = ev.clientX;
    };

    const onUp = (ev) => {
      cancelAnimationFrame(rafRef.current);

      if (didDragRef.current) {
        const dx        = ev.clientX - dragRef.current.startX;
        const deltaDays = Math.round(dx / pxPerDay);
        if (deltaDays !== 0) {
          if (type === "move") {
            updateSprint.mutate({
              sprintId:   sprint.id,
              start_date: dateKey(addDays(parseDate(dragRef.current.origStart), deltaDays)),
              end_date:   dateKey(addDays(parseDate(dragRef.current.origEnd),   deltaDays)),
            });
          } else {
            const newEnd = addDays(parseDate(dragRef.current.origEnd), deltaDays);
            if (newEnd > parseDate(dragRef.current.origStart)) {
              updateSprint.mutate({ sprintId: sprint.id, end_date: dateKey(newEnd) });
            }
          }
        }
      }

      dragRef.current = null;
      setDragPreview(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [sprint, updateSprint, setDragPreview, rightRef]);

  return (
    <div
      className="absolute"
      style={{
        top:    y,
        height: SPRINT_H,
        left:   Math.max(0, x),
        width:  Math.max(pxPerDay, w),
        // Float above the sticky left panel (z-10) while being dragged
        zIndex: isDragging ? 50 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ── Bar ── */}
      <div
        className={cn(
          "absolute rounded-lg flex items-center overflow-hidden select-none",
          isDragging ? "shadow-xl z-20" : "cursor-grab hover:brightness-[1.08]",
        )}
        style={{
          inset:           "5px 0",
          backgroundColor: color,
          opacity,
          transition:      isDragging ? "none" : "box-shadow 150ms",
          boxShadow:       hovered && !isDragging ? `0 2px 8px ${color}66` : undefined,
        }}
        onMouseDown={startDrag("move")}
      >
        {/* Progress fill */}
        {pct > 0 && (
          <div
            className="absolute inset-0 rounded-lg"
            style={{ width: `${pct}%`, backgroundColor: "rgba(255,255,255,0.18)", pointerEvents: "none" }}
          />
        )}

        {/* Sprint name */}
        <span className="relative z-10 flex-1 truncate px-2.5 text-[11px] font-semibold text-white pointer-events-none leading-none">
          {sprint.name}
        </span>

        {/* Task count */}
        {total > 0 && (
          <span className="relative z-10 text-white/70 text-[10px] font-medium pr-5 flex-shrink-0 pointer-events-none">
            {completed}/{total}
          </span>
        )}

        {/* Right-edge resize handle — always inside the bar, no independent positioning */}
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-4 flex items-center justify-center gap-px z-20 cursor-col-resize transition-opacity",
            hovered || isDragging ? "opacity-100" : "opacity-0",
          )}
          onMouseDown={(e) => { e.stopPropagation(); startDrag("resize")(e); }}
        >
          <div className="w-px h-4 bg-white/70 rounded-full pointer-events-none" />
          <div className="w-px h-4 bg-white/70 rounded-full pointer-events-none" />
        </div>
      </div>

      {/* ── Hover tooltip (only when not dragging) ── */}
      {hovered && !isDragging && (
        <div className="absolute left-0 bottom-full mb-2 z-30 bg-popover border border-border rounded-xl shadow-xl px-3 py-2.5 min-w-[200px] pointer-events-none">
          <p className="text-xs font-semibold text-foreground mb-1">{sprint.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {sprint.start_date} → {sprint.end_date}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            <StatusChip status={sprint.status} />
            <span className="text-[11px] text-muted-foreground">{completed}/{total} tasks</span>
          </div>
          {total > 0 && (
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      )}

      {/* ── Drag tooltip (replaces hover tooltip while dragging) ── */}
      {isDragging && (
        <div className="absolute left-0 -top-8 z-30 bg-foreground text-background text-[11px] font-semibold px-2 py-1 rounded-lg shadow-lg whitespace-nowrap pointer-events-none">
          {previewStart} → {previewEnd}
        </div>
      )}
    </div>
  );
}
