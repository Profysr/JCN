import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { useUpdateTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────
const ROW_H  = 36;
const HDR_H  = 52;   // two-row header
const LEFT_W = 260;
const BAR_H  = 22;
const GRP_H  = 32;
const EDGE_ZONE   = 60;   // px from edge that triggers auto-scroll
const MAX_SCROLL_SPEED = 12; // px per frame

const PX = { day: 44, week: 20, month: 8, quarter: 4 };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

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

function computeRange(tasks) {
  const dates = [];
  for (const t of tasks) {
    if (t.start_date) dates.push(parseDate(t.start_date));
    if (t.due_date)   dates.push(parseDate(t.due_date));
  }
  const today = new Date(); today.setHours(0,0,0,0);
  if (dates.length === 0) return { start: addDays(today, -30), end: addDays(today, 120) };
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  // 90 days after the last task gives plenty of drag room before the canvas needs to expand
  return { start: addDays(min, -14), end: addDays(max, 90) };
}

// ── Header builder ────────────────────────────────────────────────────────────
// Each bottom segment carries:
//   current        — true when this segment falls inside the current month
//   monthBoundary  — true when this segment starts a new calendar month
//                    (used in week/day zoom to draw a stronger separator)
function buildHeader(rangeStart, rangeEnd, zoom, pxPerDay) {
  const total   = daysBetween(rangeStart, rangeEnd);
  const now     = new Date();
  const nowM    = now.getMonth();
  const nowY    = now.getFullYear();
  const top = [], bottom = [];

  if (zoom === "day") {
    let monthStart = 0, curMonth = -1, curYear = -1;
    for (let i = 0; i <= total; i++) {
      const d = addDays(rangeStart, i);
      if (d.getMonth() !== curMonth) {
        if (curMonth !== -1) top.push({ label: `${MONTHS[curMonth]} ${curYear}`, x: monthStart * pxPerDay, w: (i - monthStart) * pxPerDay });
        curMonth = d.getMonth(); curYear = d.getFullYear(); monthStart = i;
      }
      bottom.push({
        label:         String(d.getDate()),
        x:             i * pxPerDay,
        w:             pxPerDay,
        muted:         d.getDay() === 0 || d.getDay() === 6,
        current:       d.getMonth() === nowM && d.getFullYear() === nowY,
        monthBoundary: d.getDate() === 1,
      });
    }
    top.push({ label: `${MONTHS[curMonth]} ${curYear}`, x: monthStart * pxPerDay, w: (total + 1 - monthStart) * pxPerDay });
    return { top, bottom };
  }

  if (zoom === "week") {
    // build month-level band info so we can compute current & monthBoundary per week
    const monthBands = [];
    let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (m <= rangeEnd) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const sx = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
      const ex = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
      if (ex > sx) {
        top.push({ label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}`, x: sx, w: ex - sx });
        monthBands.push({ month: m.getMonth(), year: m.getFullYear(), x: sx });
      }
      m = next;
    }

    let ws = new Date(rangeStart); ws.setDate(ws.getDate() - ws.getDay());
    while (ws <= rangeEnd) {
      const x   = Math.max(0, daysBetween(rangeStart, ws)) * pxPerDay;
      const ref = ws < rangeStart ? rangeStart : ws;
      // week is "current" if any of its 7 days falls in the current month
      const weekEnd = addDays(ws, 6);
      const isCur   = (ref.getMonth() === nowM && ref.getFullYear() === nowY)
                   || (weekEnd.getMonth() === nowM && weekEnd.getFullYear() === nowY);
      // monthBoundary: this week's Sunday falls on the 1st, or the ref date is the 1st
      const isBound = ref.getDate() === 1 || ws.getDate() === 1;
      bottom.push({ label: `${MONTHS[ref.getMonth()]} ${ref.getDate()}`, x, w: 7 * pxPerDay, current: isCur, monthBoundary: isBound });
      ws = addDays(ws, 7);
    }
    return { top, bottom };
  }

  if (zoom === "month") {
    let yearStart = -1, yearX = 0;
    let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (m <= rangeEnd) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const sx   = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
      const w    = daysBetween(m, next) * pxPerDay;
      bottom.push({
        label:         MONTHS[m.getMonth()],
        x:             sx,
        w,
        current:       m.getMonth() === nowM && m.getFullYear() === nowY,
        monthBoundary: true, // every segment IS a month boundary in month zoom
      });
      if (m.getFullYear() !== yearStart) {
        if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: sx - yearX });
        yearStart = m.getFullYear(); yearX = sx;
      }
      m = next;
    }
    top.push({ label: String(yearStart), x: yearX, w: total * pxPerDay - yearX });
    return { top, bottom };
  }

  // quarter
  let yearStart = -1, yearX = 0;
  let q = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1);
  while (q <= rangeEnd) {
    const next    = new Date(q.getFullYear(), q.getMonth() + 3, 1);
    const sx      = Math.max(0, daysBetween(rangeStart, q)) * pxPerDay;
    const ex      = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
    const qEnd    = addDays(next, -1);
    const isCur   = (q.getMonth() <= nowM && qEnd.getMonth() >= nowM && q.getFullYear() === nowY);
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

// ── Grouping ──────────────────────────────────────────────────────────────────
function buildRows(tasks, groupBy, statuses, collapsed) {
  const dated   = tasks.filter(t => t.start_date || t.due_date);
  const undated = tasks.filter(t => !t.start_date && !t.due_date);

  const groups = new Map();
  for (const t of dated) {
    let id, label, color;
    if (groupBy === "status") {
      const s = statuses.find(s => s.id === (t.status_detail?.id ?? t.status_id));
      id = s?.id || "none"; label = s?.name || "No Status"; color = s?.color || "#94a3b8";
    } else if (groupBy === "assignee") {
      id = t.assignee?.id || "unassigned";
      label = t.assignee ? (t.assignee.full_name || t.assignee.email) : "Unassigned";
      color = "#6366f1";
    } else {
      id = t.sprint_detail?.id || "backlog"; label = t.sprint_detail?.name || "Backlog"; color = "#8b5cf6";
    }
    if (!groups.has(id)) groups.set(id, { id, label, color, tasks: [] });
    groups.get(id).tasks.push(t);
  }

  const rows = []; let y = 0;
  for (const g of groups.values()) {
    rows.push({ type: "group", id: g.id, label: g.label, color: g.color, y });
    y += GRP_H;
    if (!collapsed.has(g.id)) {
      for (const t of g.tasks) { rows.push({ type: "task", task: t, y }); y += ROW_H; }
    }
  }
  return { rows, undated, totalH: Math.max(y, 1) };
}

// ── Critical path ─────────────────────────────────────────────────────────────
function computeCriticalPath(tasks) {
  const map = new Map(tasks.map(t => [t.id, t]));
  const dur = (t) => {
    const s = parseDate(t.start_date || t.due_date);
    const e = parseDate(t.due_date   || t.start_date);
    if (!s || !e) return 1;
    return Math.max(1, daysBetween(s, e) + 1);
  };
  const memo = new Map(), seen = new Set();
  const dp = (id) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id))  return 0;
    seen.add(id);
    const t = map.get(id);
    if (!t) { seen.delete(id); return 0; }
    const v = (t.blocked_by_ids || []).reduce((acc, bid) => Math.max(acc, dp(bid)), 0) + dur(t);
    memo.set(id, v); seen.delete(id); return v;
  };
  tasks.forEach(t => dp(t.id));
  const maxDist = Math.max(0, ...[...memo.values()]);
  if (maxDist === 0) return new Set();
  const crit = new Set();
  const trace = (id) => {
    if (crit.has(id)) return;
    crit.add(id);
    const t = map.get(id); if (!t) return;
    const d = memo.get(id) || 0;
    for (const bid of (t.blocked_by_ids || [])) {
      if ((memo.get(bid) || 0) === d - dur(t)) trace(bid);
    }
  };
  for (const [id, d] of memo) { if (d === maxDist) trace(id); }
  return crit;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GanttView({
  tasks = [], statuses = [], sprints = [],
  onTaskClick, workspaceSlug, projectId, canEdit = false,
}) {
  const [zoom,       setZoom]      = useState("week");
  const [groupBy,    setGroupBy]   = useState("status");
  const [collapsed,  setCollapsed] = useState(new Set());
  // Live drag preview: { taskId, type: "move"|"resize", deltaDays }
  const [dragPreview, setDragPreview] = useState(null);

  const updateTask = useUpdateTask(workspaceSlug, projectId);
  const pxPerDay   = PX[zoom];

  const { start: rangeStart, end: baseRangeEnd } = useMemo(() => computeRange(tasks), [tasks]);

  // Extend the canvas live while dragging so the bar never hits a hard wall
  const rangeEnd = useMemo(() => {
    if (!dragPreview) return baseRangeEnd;
    const task = tasks.find(t => t.id === dragPreview.taskId);
    if (!task) return baseRangeEnd;
    const refDateStr = dragPreview.type === "resize"
      ? (task.due_date || task.start_date)
      : (task.due_date || task.start_date);
    const refDate = parseDate(refDateStr);
    if (!refDate) return baseRangeEnd;
    const projected = addDays(refDate, dragPreview.deltaDays);
    // If drag preview pushes past the current end, extend by 90 more days
    return projected > baseRangeEnd ? addDays(projected, 90) : baseRangeEnd;
  }, [baseRangeEnd, dragPreview, tasks]);

  const totalDays  = daysBetween(rangeStart, rangeEnd);
  const totalWidth = totalDays * pxPerDay;

  const header   = useMemo(() => buildHeader(rangeStart, rangeEnd, zoom, pxPerDay), [rangeStart, rangeEnd, zoom, pxPerDay]);
  const { rows, undated, totalH } = useMemo(() => buildRows(tasks, groupBy, statuses, collapsed), [tasks, groupBy, statuses, collapsed]);
  const critical = useMemo(() => computeCriticalPath(tasks), [tasks]);

  // Both panels share a single scrollable container (rightRef) so the date
  // header is sticky inside it — horizontal scroll stays in sync automatically.
  const rightRef    = useRef(null);
  const leftBodyRef = useRef(null);
  const syncingRef  = useRef(false);

  // Sync vertical scroll: left ↔ right
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

  const scrollToToday = useCallback(() => {
    if (!rightRef.current) return;
    const today = new Date(); today.setHours(0,0,0,0);
    const x = daysBetween(rangeStart, today) * pxPerDay;
    rightRef.current.scrollLeft = Math.max(0, x - 200);
  }, [rangeStart, pxPerDay]);

  // On mount: center on today once.
  useEffect(() => { scrollToToday(); }, []);

  // On zoom change: re-center on today so the new scale makes sense visually.
  // Intentionally NOT including rangeStart — task saves change rangeStart but
  // must never scroll the viewport (the date change is off-screen, not "today").
  useEffect(() => { scrollToToday(); }, [zoom]);

  const goToday = () => {
    if (!rightRef.current) return;
    const today = new Date(); today.setHours(0,0,0,0);
    rightRef.current.scrollLeft = Math.max(0, daysBetween(rangeStart, today) * pxPerDay - 200);
  };

  // ── Bar geometry helpers ─────────────────────────────────────────────────
  const barX = (task, deltaDays = 0, type = "move") => {
    const s = parseDate(type === "move" ? (task.start_date || task.due_date) : (task.start_date || task.due_date));
    if (!s) return -1;
    return daysBetween(rangeStart, s) * pxPerDay + (type === "move" ? deltaDays * pxPerDay : 0);
  };
  const barW = (task, deltaDays = 0, type = "move") => {
    const s = parseDate(task.start_date || task.due_date);
    const e = parseDate(task.due_date   || task.start_date);
    if (!s || !e) return pxPerDay;
    const base = Math.max(pxPerDay, daysBetween(s, e) * pxPerDay + pxPerDay);
    if (type === "resize") return Math.max(pxPerDay, base + deltaDays * pxPerDay);
    return base;
  };

  // ── Drag with live preview and edge auto-scroll ──────────────────────────
  const drag           = useRef(null);   // raw drag state (mutable, no re-render)
  const didDragRef     = useRef(false);  // true when mouse moved enough — suppresses the following click
  const rafRef   = useRef(null);   // requestAnimationFrame handle

  const startDrag = useCallback((e, task, type) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();

    drag.current = {
      taskId:    task.id,
      type,
      startX:    e.clientX,
      origStart: task.start_date,
      origDue:   task.due_date,
      scrollLeft: rightRef.current?.scrollLeft ?? 0,
    };

    // Auto-scroll loop: runs every animation frame while dragging
    // Small movement threshold — prevents auto-scroll firing on the initial click
    // (which would race to scrollLeft=0 if the cursor was near the left edge).
    const MOVE_THRESHOLD = 4;

    const scrollLoop = () => {
      if (!drag.current || !rightRef.current) return;

      const dx    = drag.current.lastClientX != null ? drag.current.lastClientX - drag.current.startX : 0;
      const moved = Math.abs(dx) > MOVE_THRESHOLD;

      if (moved) {
        const rect      = rightRef.current.getBoundingClientRect();
        const mouseX    = drag.current.lastClientX ?? drag.current.startX;
        const fromLeft  = mouseX - rect.left;
        const fromRight = rect.right - mouseX;

        let scrollDelta = 0;
        if (fromRight < EDGE_ZONE) scrollDelta =  Math.round((1 - fromRight / EDGE_ZONE) * MAX_SCROLL_SPEED);
        if (fromLeft  < EDGE_ZONE) scrollDelta = -Math.round((1 - fromLeft  / EDGE_ZONE) * MAX_SCROLL_SPEED);

        if (scrollDelta !== 0) {
          rightRef.current.scrollLeft += scrollDelta;
          drag.current.startX         -= scrollDelta;
        }

        const deltaDays = Math.round(dx / pxPerDay);
        setDragPreview({ taskId: drag.current.taskId, type: drag.current.type, deltaDays });
      }

      rafRef.current = requestAnimationFrame(scrollLoop);
    };

    rafRef.current = requestAnimationFrame(scrollLoop);

    const onMove = (ev) => {
      if (!drag.current) return;
      drag.current.lastClientX = ev.clientX;
      // Preview is updated by the RAF loop — no extra setState here to avoid flooding
    };

    const onUp = (ev) => {
      cancelAnimationFrame(rafRef.current);

      if (drag.current) {
        const dx        = ev.clientX - drag.current.startX;
        const deltaDays = Math.round(dx / pxPerDay);
        if (deltaDays !== 0) {
          const updates = {};
          if (drag.current.type === "move") {
            if (drag.current.origStart) updates.start_date = dateKey(addDays(parseDate(drag.current.origStart), deltaDays));
            if (drag.current.origDue)   updates.due_date   = dateKey(addDays(parseDate(drag.current.origDue),   deltaDays));
          } else {
            const base = drag.current.origDue || drag.current.origStart;
            if (base) updates.due_date = dateKey(addDays(parseDate(base), deltaDays));
          }
          if (Object.keys(updates).length) {
            updateTask.mutate({ taskId: drag.current.taskId, ...updates });
            didDragRef.current = true;  // suppress the following click event
          }
        }
      }

      drag.current = null;
      setDragPreview(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [canEdit, pxPerDay, updateTask]);

  // Cleanup RAF on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const today      = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const todayX     = daysBetween(rangeStart, today) * pxPerDay;
  const todayVis   = todayX >= 0 && todayX <= totalWidth;

  const rowYMap = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.type === "task") m.set(r.task.id, r.y);
    return m;
  }, [rows]);

  const toggleGroup = (id) => setCollapsed(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card flex-shrink-0 text-sm">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {["day","week","month","quarter"].map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={cn("px-2.5 py-1 rounded-md capitalize text-xs font-medium transition-colors",
                zoom === z ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {z}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Group:</span>
          {["status","assignee","sprint"].map(g => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={cn("px-2 py-0.5 rounded capitalize transition-colors",
                groupBy === g ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-muted-foreground")}>
              {g}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded border border-border hover:bg-accent transition-colors">
          Today
        </button>
      </div>

      {/* Body: left panel + right panel */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 flex flex-col border-r border-border shadow-sm z-10" style={{ width: LEFT_W }}>
          {/* Aligns with the sticky date header */}
          <div className="flex-shrink-0 border-b border-border bg-muted/40 flex items-end px-3 pb-1.5" style={{ height: HDR_H }}>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</span>
          </div>
          {/* Scrolls vertically in sync with right panel */}
          <div ref={leftBodyRef} className="flex-1 overflow-y-auto overflow-x-hidden" onScroll={onLeftScroll}>
            <div className="relative" style={{ height: totalH }}>
              {rows.map((row) => {
                if (row.type === "group") {
                  return (
                    <div key={row.id}
                      className="absolute flex items-center gap-1.5 px-3 bg-muted/30 border-b border-border cursor-pointer hover:bg-muted/50 select-none"
                      style={{ top: row.y, height: GRP_H, width: LEFT_W - 1 }}
                      onClick={() => toggleGroup(row.id)}>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="text-xs font-semibold text-foreground truncate flex-1">{row.label}</span>
                      {collapsed.has(row.id) ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                    </div>
                  );
                }
                const t = row.task;
                return (
                  <div key={t.id}
                    className="absolute flex items-center gap-2 px-3 border-b border-border/50 hover:bg-accent/30 cursor-pointer"
                    style={{ top: row.y, height: ROW_H, width: LEFT_W - 1 }}
                    onClick={() => onTaskClick(t.id)}>
                    <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-primary">
                      {(t.assignee?.full_name || t.assignee?.email || "?")[0].toUpperCase()}
                    </div>
                    <span className="text-xs text-foreground truncate flex-1">{t.title}</span>
                    {critical.has(t.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Critical path" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right panel — single scroll container ──────────────────────── */}
        {/*   Horizontal scroll moves both header and bars together.          */}
        {/*   Vertical scroll is synced to the left panel.                    */}
        <div
          ref={rightRef}
          className="flex-1 overflow-auto"
          onScroll={onRightScroll}
          style={{ cursor: dragPreview ? (dragPreview.type === "resize" ? "ew-resize" : "grabbing") : "default" }}
        >
          {/* ── Date header — sticky so it stays visible when scrolling down ── */}
          <div
            className="sticky top-0 z-20 bg-muted/40 border-b border-border"
            style={{ height: HDR_H, width: totalWidth }}
          >
            {/* Row 1 — years / quarters / months */}
            {header.top.map((seg, i) => (
              <div key={i}
                className="absolute top-0 flex items-center px-2 border-r border-border/40 text-[11px] font-semibold text-muted-foreground overflow-hidden"
                style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                {seg.label}
              </div>
            ))}
            {/* Row 2 — months / weeks / days */}
            {header.bottom.map((seg, i) => (
              <div key={i}
                className={cn(
                  "absolute bottom-0 flex items-center justify-center border-r border-border/40 text-[11px] select-none",
                  seg.current ? "text-primary font-semibold"
                  : seg.muted ? "text-muted-foreground/35"
                  :              "text-muted-foreground font-medium",
                )}
                style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                {seg.label}
              </div>
            ))}
          </div>

          {/* ── Gantt bars area ── */}
          <div className="relative" style={{ width: totalWidth, height: totalH }}>

            {/* Current-period shading — subtle tint on this month's column */}
            {header.bottom.filter(seg => seg.current).map((seg, i) => (
              <div
                key={`cur-${i}`}
                className="absolute top-0 bottom-0 bg-primary/10 pointer-events-none"
                style={{ left: seg.x, width: seg.w }}
              />
            ))}

            {/* Vertical grid lines — month boundaries are stronger than inner lines */}
            {header.bottom.map((seg, i) => (
              <div
                key={i}
                className={seg.monthBoundary
                  ? "absolute top-0 bottom-0 border-r border-border/70"
                  : "absolute top-0 bottom-0 border-r border-border/35"}
                style={{ left: seg.x, width: seg.w }}
              />
            ))}

            {/* Today line */}
            {todayVis && (
              <div className="absolute top-0 bottom-0 w-px bg-red-400/70 z-10 pointer-events-none" style={{ left: todayX }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-red-400" />
              </div>
            )}

            {/* Group header bands */}
            {rows.filter(r => r.type === "group").map(r => (
              <div key={r.id} className="absolute left-0 right-0 bg-muted/20 border-b border-border" style={{ top: r.y, height: GRP_H }} />
            ))}

            {/* Task bars */}
            {rows.filter(r => r.type === "task").map(r => {
              const t     = r.task;
              const isPreviewing = dragPreview?.taskId === t.id;
              const dd    = isPreviewing ? dragPreview.deltaDays : 0;
              const dType = isPreviewing ? dragPreview.type      : "move";

              const x = barX(t, dd, dType);
              const w = barW(t, dd, dType);
              if (x < 0 && !isPreviewing) return null;

              const s     = statuses.find(s => s.id === (t.status_detail?.id ?? t.status_id));
              const color = critical.has(t.id) ? "#f59e0b" : (s?.color || "#6366f1");

              return (
                <div key={t.id}
                  className="absolute flex items-center group pointer-events-none"
                  style={{ top: r.y, height: ROW_H, left: Math.max(0, x), width: w + 10 }}>
                  {/* Bar body */}
                  <div
                    className={cn(
                      "relative rounded flex items-center px-2 select-none pointer-events-auto",
                      isPreviewing ? "opacity-90 shadow-lg ring-2 ring-white/30" : "hover:opacity-90 cursor-grab active:cursor-grabbing",
                      "transition-[width,left] duration-[50ms]",
                    )}
                    style={{ width: Math.max(8, w), height: BAR_H, backgroundColor: color }}
                    onMouseDown={e => { if (e.button !== 0) return; startDrag(e, t, "move"); }}
                    onClick={e => {
                      if (didDragRef.current) { didDragRef.current = false; return; }
                      e.stopPropagation();
                      onTaskClick(t.id);
                    }}
                    title={t.title}
                  >
                    <span className="text-[11px] font-medium text-white truncate leading-none pointer-events-none">
                      {t.title}
                    </span>
                    {/* Right-edge resize handle */}
                    {canEdit && (
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize rounded-r opacity-0 group-hover:opacity-100 bg-black/25 transition-opacity pointer-events-auto"
                        onMouseDown={e => { e.stopPropagation(); startDrag(e, t, "resize"); }}
                      />
                    )}
                  </div>

                  {/* Live date tooltip while dragging */}
                  {isPreviewing && (
                    <div className="absolute -top-6 left-0 bg-foreground text-background text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap z-30 pointer-events-none shadow">
                      {dType === "resize"
                        ? dateKey(addDays(parseDate(t.due_date || t.start_date || ""), dd))
                        : dateKey(addDays(parseDate(t.start_date || t.due_date || ""), dd))
                      }
                    </div>
                  )}
                </div>
              );
            })}

            {/* Dependency arrows */}
            <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ width: totalWidth, height: totalH }}>
              <defs>
                <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L6,3 z" fill="#94a3b8" />
                </marker>
              </defs>
              {rows.filter(r => r.type === "task").flatMap(r => {
                const t = r.task;
                return (t.blocked_by_ids || []).map(bid => {
                  const blockerRow = rows.find(rr => rr.type === "task" && rr.task.id === bid);
                  if (!blockerRow) return null;
                  const bt = blockerRow.task;
                  const x1 = barX(bt) + barW(bt);
                  const y1 = blockerRow.y + ROW_H / 2;
                  const x2 = barX(t);
                  const y2 = r.y + ROW_H / 2;
                  if (x1 < 0 || x2 < 0) return null;
                  const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
                  const cx2 = x2 - Math.abs(x2 - x1) * 0.4;
                  return (
                    <path key={`${bid}-${t.id}`}
                      d={`M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`}
                      stroke="#94a3b8" strokeWidth="1.5" fill="none" strokeDasharray="4 3"
                      markerEnd="url(#gantt-arrow)" />
                  );
                }).filter(Boolean);
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* No-dates shelf */}
      {undated.length > 0 && (
        <div className="flex-shrink-0 border-t border-border px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
          <span className="font-medium">{undated.length} task{undated.length !== 1 ? "s" : ""} with no dates</span>
          <span className="ml-1">— assign a start or due date to show on the timeline.</span>
        </div>
      )}
    </div>
  );
}
