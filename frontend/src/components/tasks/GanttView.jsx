/**
 * GanttView — Sprint-first Roadmap + Timeline
 * --------------------------------------------
 * Layout:
 *   ┌─────────────┬────────────────────────────────────────┐
 *   │  Left panel │  Date header (DOM, shifts with sL)     │
 *   │  (DOM list, │  ────────────────────────────────────── │
 *   │  virtualized│  Canvas (bars)   z-index 0             │
 *   │  rows)      │  Scroll driver   z-index 10 (events)   │
 *   └─────────────┴────────────────────────────────────────┘
 *
 * Performance strategy for 5 000+ tasks:
 *  - Canvas draws only the ~30 rows visible in the viewport (binary-search start row).
 *  - On scroll: header shifts via CSS transform on a ref (0 React re-renders).
 *  - On scroll: canvas.redraw() via imperative ref (0 React re-renders).
 *  - Left panel re-renders only when the first-visible-row index changes
 *    (batched setState, typically <2 re-renders/second while scrolling).
 *  - Drag state is managed in a plain ref + a single `dragPreview` state;
 *    the canvas reads the state and redraws — no DOM mutation during drag.
 */

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useUpdateTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import GanttCanvas from "@/components/tasks/GanttCanvas";
import {
  useGanttModel, computeRange, computeCriticalPath,
  firstVisibleIdx,
  parseDate, dateKey, daysBetween, addDays,
  GROUP_H, ROW_H,
} from "@/hooks/useGanttModel";

// ── Constants ─────────────────────────────────────────────────────────────────
const HDR_H  = 52;
const LEFT_W = 260;
const PX     = { day: 44, week: 20, month: 8, quarter: 4 };
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Date header builder ───────────────────────────────────────────────────────
function buildHeader(rangeStart, rangeEnd, zoom, pxPerDay) {
  const total = daysBetween(rangeStart, rangeEnd);
  const now   = new Date();
  const nowM  = now.getMonth();
  const nowY  = now.getFullYear();
  const top = [], bottom = [];

  if (zoom === "day") {
    let monthStart = 0, curM = -1, curY = -1;
    for (let i = 0; i <= total; i++) {
      const d = addDays(rangeStart, i);
      if (d.getMonth() !== curM) {
        if (curM !== -1) top.push({ label: `${MONTHS[curM]} ${curY}`, x: monthStart * pxPerDay, w: (i - monthStart) * pxPerDay });
        curM = d.getMonth(); curY = d.getFullYear(); monthStart = i;
      }
      bottom.push({ label: String(d.getDate()), x: i * pxPerDay, w: pxPerDay,
        muted: d.getDay() === 0 || d.getDay() === 6,
        current: d.getMonth() === nowM && d.getFullYear() === nowY,
        monthBoundary: d.getDate() === 1 });
    }
    top.push({ label: `${MONTHS[curM]} ${curY}`, x: monthStart * pxPerDay, w: (total + 1 - monthStart) * pxPerDay });
    return { top, bottom };
  }

  if (zoom === "week") {
    let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (m <= rangeEnd) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const sx = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
      const ex = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
      if (ex > sx) top.push({ label: `${MONTHS[m.getMonth()]} ${m.getFullYear()}`, x: sx, w: ex - sx });
      m = next;
    }
    let ws = new Date(rangeStart); ws.setDate(ws.getDate() - ws.getDay());
    while (ws <= rangeEnd) {
      const x   = Math.max(0, daysBetween(rangeStart, ws)) * pxPerDay;
      const ref = ws < rangeStart ? rangeStart : ws;
      const we  = addDays(ws, 6);
      const cur = (ref.getMonth() === nowM && ref.getFullYear() === nowY) || (we.getMonth() === nowM && we.getFullYear() === nowY);
      bottom.push({ label: `${MONTHS[ref.getMonth()]} ${ref.getDate()}`, x, w: 7 * pxPerDay, current: cur, monthBoundary: ref.getDate() === 1 || ws.getDate() === 1 });
      ws = addDays(ws, 7);
    }
    return { top, bottom };
  }

  if (zoom === "month") {
    let yearStart = -1, yearX = 0;
    let m = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (m <= rangeEnd) {
      const next = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      const sx = Math.max(0, daysBetween(rangeStart, m)) * pxPerDay;
      const w  = daysBetween(m, next) * pxPerDay;
      bottom.push({ label: MONTHS[m.getMonth()], x: sx, w, current: m.getMonth() === nowM && m.getFullYear() === nowY, monthBoundary: true });
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
    const next = new Date(q.getFullYear(), q.getMonth() + 3, 1);
    const sx   = Math.max(0, daysBetween(rangeStart, q)) * pxPerDay;
    const ex   = Math.min(total, daysBetween(rangeStart, next)) * pxPerDay;
    const qEnd = addDays(next, -1);
    const cur  = q.getMonth() <= nowM && qEnd.getMonth() >= nowM && q.getFullYear() === nowY;
    bottom.push({ label: `Q${Math.floor(q.getMonth() / 3) + 1}`, x: sx, w: ex - sx, current: cur, monthBoundary: true });
    if (q.getFullYear() !== yearStart) {
      if (yearStart !== -1) top.push({ label: String(yearStart), x: yearX, w: sx - yearX });
      yearStart = q.getFullYear(); yearX = sx;
    }
    q = next;
  }
  top.push({ label: String(yearStart), x: yearX, w: total * pxPerDay - yearX });
  return { top, bottom };
}

// ── Left panel row components ─────────────────────────────────────────────────
function GroupRow({ row, onToggle }) {
  const isOngoing = row.type === "ongoing";
  const label     = isOngoing ? row.label : row.sprint?.name;
  const dotColor  = isOngoing ? "#8b5cf6"
    : row.sprint?.status === "completed" ? "#10b981"
    : row.sprint?.status === "active"    ? "#6366f1"
    :                                      "#94a3b8";

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 border-b border-border cursor-pointer select-none",
        "hover:bg-accent/40 transition-colors",
        isOngoing ? "bg-violet-500/5" : "bg-muted/30",
      )}
      style={{ height: GROUP_H }}
      onClick={() => onToggle(row.id)}
    >
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
      <span className="text-xs font-semibold text-foreground truncate flex-1">{label}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums flex-shrink-0">{row.taskCount}</span>
      {row.expanded
        ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      }
    </div>
  );
}

function TaskRow({ row, onTaskClick, criticalSet }) {
  const { task } = row;
  const primary  = task.assignees?.[0];
  return (
    <div
      className="flex items-center gap-2 px-3 border-b border-border/50 hover:bg-accent/30 cursor-pointer"
      style={{ height: ROW_H }}
      onClick={() => onTaskClick(task.id)}
    >
      <Avatar
        name={primary?.full_name || primary?.email}
        src={primary?.avatar}
        size="xs"
      />
      <span className="text-xs text-foreground truncate flex-1">{task.title}</span>
      {criticalSet?.has(task.id) && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Critical path" />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GanttView({
  tasks = [], statuses = [], sprints = [],
  onTaskClick, workspaceId, boardId, canEdit = false,
}) {
  const [zoom, setZoom] = useState("week");

  // Sprints collapsed by default — user expands to see tasks
  const [collapsed, setCollapsed] = useState(
    () => new Set(sprints.map(s => s.id))
  );

  const [dragPreview, setDragPreview] = useState(null);
  // scrollTop state: only updated when the visible window shifts (left panel re-render trigger)
  const [scrollTop, setScrollTop] = useState(0);

  const updateTask = useUpdateTask(workspaceId, boardId);
  const pxPerDay   = PX[zoom];

  // ── Data ───────────────────────────────────────────────────────────────────
  const { rows, undated, totalH } = useGanttModel(tasks, sprints, collapsed);
  const criticalSet = useMemo(() => computeCriticalPath(tasks), [tasks]);

  const { start: rangeStart, end: rangeEnd } = useMemo(
    () => computeRange(tasks, sprints), [tasks, sprints]
  );
  const totalDays  = daysBetween(rangeStart, rangeEnd);
  const totalWidth = totalDays * pxPerDay;

  const header = useMemo(
    () => buildHeader(rangeStart, rangeEnd, zoom, pxPerDay),
    [rangeStart, rangeEnd, zoom, pxPerDay]
  );

  // ── Refs ───────────────────────────────────────────────────────────────────
  const scrollDriverRef = useRef(null); // transparent overlay: scrollbars + pointer events
  const headerShiftRef  = useRef(null); // inner header div shifted by CSS transform
  const canvasRef       = useRef(null); // GanttCanvas imperative handle { redraw }
  const scrollTopRef    = useRef(0);
  const scrollLeftRef   = useRef(0);
  const dragRef         = useRef(null); // mutable drag state
  const rafRef          = useRef(null);
  const didDragRef      = useRef(false);

  // ── Scroll: zero React re-renders for header + canvas ─────────────────────
  const handleScroll = useCallback((e) => {
    const sT = e.target.scrollTop;
    const sL = e.target.scrollLeft;
    scrollTopRef.current  = sT;
    scrollLeftRef.current = sL;

    // Header shift — pure DOM, no React
    if (headerShiftRef.current) {
      headerShiftRef.current.style.transform = `translateX(-${sL}px)`;
    }
    // Canvas redraw — imperative, no React
    canvasRef.current?.redraw();

    // Left panel — React, but batched: only when first visible row index changes
    setScrollTop(prev => {
      const prevIdx = firstVisibleIdx(rows, prev);
      const nextIdx = firstVisibleIdx(rows, sT);
      return prevIdx !== nextIdx ? sT : prev;
    });
  }, [rows]);

  // ── Center on today ────────────────────────────────────────────────────────
  const scrollToToday = useCallback(() => {
    const driver = scrollDriverRef.current;
    if (!driver) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const x = daysBetween(rangeStart, today) * pxPerDay;
    driver.scrollLeft = Math.max(0, x - driver.clientWidth / 2);
  }, [rangeStart, pxPerDay]);

  useEffect(() => { scrollToToday(); }, []);
  useEffect(() => { scrollToToday(); }, [zoom]);

  // ── Hit test ───────────────────────────────────────────────────────────────
  const hitTest = useCallback((clientX, clientY) => {
    const driver = scrollDriverRef.current;
    if (!driver) return null;
    const rect     = driver.getBoundingClientRect();
    const contentY = clientY - rect.top  + driver.scrollTop;
    const contentX = clientX - rect.left + driver.scrollLeft;

    let lo = 0, hi = rows.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r   = rows[mid];
      if (r.y + r.h <= contentY) lo = mid + 1;
      else if (r.y > contentY)   hi = mid - 1;
      else { found = mid; break; }
    }
    if (found < 0) return null;

    const row = rows[found];
    if (row.type !== "task") return { kind: "group", rowId: row.id };

    const { task } = row;
    const sd = parseDate(task.start_date || task.due_date);
    const ed = parseDate(task.due_date   || task.start_date);
    if (!sd) return { kind: "empty" };

    const bxAbs = daysBetween(rangeStart, sd) * pxPerDay;
    const bwAbs = Math.max(pxPerDay, (daysBetween(sd, ed) + 1) * pxPerDay);

    if (contentX >= bxAbs - 4 && contentX <= bxAbs + bwAbs + 4) {
      const isResize = canEdit && contentX >= bxAbs + bwAbs - 10;
      return { kind: "task", taskId: task.id, task, dragType: isResize ? "resize" : "move" };
    }
    return { kind: "empty" };
  }, [rows, rangeStart, pxPerDay, canEdit]);

  // ── Drag ───────────────────────────────────────────────────────────────────
  const onDriverMouseDown = useCallback((e) => {
    if (e.button !== 0 || !canEdit) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit || hit.kind !== "task") return;

    e.preventDefault();
    dragRef.current = {
      taskId: hit.taskId, type: hit.dragType, task: hit.task,
      startX: e.clientX,
      origStart: hit.task.start_date,
      origDue:   hit.task.due_date,
    };

    const EDGE = 60, MAX_SPD = 12;
    const loop = () => {
      if (!dragRef.current) return;
      const driver = scrollDriverRef.current;
      if (!driver) return;
      const lx = dragRef.current.lastX ?? dragRef.current.startX;
      const dx = lx - dragRef.current.startX;
      if (Math.abs(dx) > 4) {
        const rect  = driver.getBoundingClientRect();
        const fromL = lx - rect.left;
        const fromR = rect.right - lx;
        let delta = 0;
        if (fromR < EDGE) delta =  Math.round((1 - fromR / EDGE) * MAX_SPD);
        if (fromL < EDGE) delta = -Math.round((1 - fromL / EDGE) * MAX_SPD);
        if (delta !== 0) { driver.scrollLeft += delta; dragRef.current.startX -= delta; }
        const days = Math.round((lx - dragRef.current.startX) / pxPerDay);
        setDragPreview({ taskId: dragRef.current.taskId, type: dragRef.current.type, deltaDays: days });
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onMove = (ev) => { if (dragRef.current) dragRef.current.lastX = ev.clientX; };
    const onUp   = (ev) => {
      cancelAnimationFrame(rafRef.current);
      if (dragRef.current) {
        const dx        = ev.clientX - dragRef.current.startX;
        const deltaDays = Math.round(dx / pxPerDay);
        if (Math.abs(deltaDays) > 0) {
          const updates = {};
          if (dragRef.current.type === "move") {
            if (dragRef.current.origStart) updates.start_date = dateKey(addDays(parseDate(dragRef.current.origStart), deltaDays));
            if (dragRef.current.origDue)   updates.due_date   = dateKey(addDays(parseDate(dragRef.current.origDue),   deltaDays));
          } else {
            const base = dragRef.current.origDue || dragRef.current.origStart;
            if (base) updates.due_date = dateKey(addDays(parseDate(base), deltaDays));
          }
          if (Object.keys(updates).length) {
            updateTask.mutate({ taskId: dragRef.current.taskId, ...updates });
            didDragRef.current = true;
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
  }, [canEdit, hitTest, pxPerDay, updateTask]);

  const onDriverMouseMove = useCallback((e) => {
    if (dragRef.current) return;
    const driver = scrollDriverRef.current;
    if (!driver) return;
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit || hit.kind === "empty")   driver.style.cursor = "default";
    else if (hit.kind === "group")      driver.style.cursor = "pointer";
    else if (hit.dragType === "resize") driver.style.cursor = "ew-resize";
    else                                driver.style.cursor = canEdit ? "grab" : "pointer";
  }, [hitTest, canEdit]);

  const onDriverClick = useCallback((e) => {
    if (didDragRef.current) { didDragRef.current = false; return; }
    const hit = hitTest(e.clientX, e.clientY);
    if (!hit) return;
    if (hit.kind === "task")  onTaskClick(hit.taskId);
    if (hit.kind === "group") toggleCollapsed(hit.rowId);
  }, [hitTest, onTaskClick]);

  const toggleCollapsed = useCallback((id) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ── Left panel virtualization ───────────────────────────────────────────────
  const BUFFER   = 4;
  const startIdx = firstVisibleIdx(rows, scrollTop);
  const endIdx   = Math.min(rows.length, startIdx + 35 + BUFFER);
  const topPad   = rows[startIdx]?.y ?? 0;
  const botPad   = Math.max(0, totalH - (rows[endIdx - 1] ? rows[endIdx - 1].y + rows[endIdx - 1].h : totalH));

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b bg-card flex-shrink-0">
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {["day","week","month","quarter"].map(z => (
            <button key={z} onClick={() => setZoom(z)}
              className={cn("px-2.5 py-1 rounded-md capitalize text-xs font-medium transition-colors",
                zoom === z ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {z}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={scrollToToday}
          className="px-2.5 py-1 text-xs font-medium rounded border hover:bg-accent transition-colors"
        >
          Today
        </button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">

        {/* Left panel — DOM, virtualized */}
        <div
          className="flex-shrink-0 flex flex-col border-r shadow-sm z-10 bg-card overflow-hidden"
          style={{ width: LEFT_W }}
        >
          {/* Header spacer */}
          <div
            className="flex-shrink-0 border-b bg-muted/40 flex items-end px-3 pb-1.5"
            style={{ height: HDR_H }}
          >
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Sprint / Task
            </span>
          </div>

          {/* Virtualized row list — scrolls are kept in sync via scrollDriverRef */}
          <div className="flex-1 relative overflow-hidden">
            <div style={{ position: "absolute", inset: 0, overflowY: "hidden" }}>
              <div style={{ height: topPad }} />
              {rows.slice(startIdx, endIdx).map(row => {
                if (row.type === "sprint" || row.type === "ongoing") {
                  return <GroupRow key={row.id} row={row} onToggle={toggleCollapsed} />;
                }
                return <TaskRow key={row.id} row={row} onTaskClick={onTaskClick} criticalSet={criticalSet} />;
              })}
              <div style={{ height: botPad }} />
            </div>
          </div>
        </div>

        {/* Right area */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Date header — DOM, scrolls horizontally via CSS transform (no React re-render) */}
          <div
            className="flex-shrink-0 border-b bg-muted/40 overflow-hidden"
            style={{ height: HDR_H }}
          >
            <div
              ref={headerShiftRef}
              style={{ width: totalWidth, height: HDR_H, position: "relative" }}
            >
              {header.top.map((seg, i) => (
                <div key={i}
                  className="absolute top-0 flex items-center px-2 border-r border-border/40 text-[11px] font-semibold text-muted-foreground overflow-hidden"
                  style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                  {seg.label}
                </div>
              ))}
              {header.bottom.map((seg, i) => (
                <div key={i}
                  className={cn(
                    "absolute bottom-0 flex items-center justify-center border-r border-border/40 text-[11px] select-none",
                    seg.current ? "text-primary font-semibold"
                    : seg.muted  ? "text-muted-foreground/35"
                    :              "text-muted-foreground font-medium",
                  )}
                  style={{ left: seg.x, width: seg.w, height: HDR_H / 2 }}>
                  {seg.label}
                </div>
              ))}
            </div>
          </div>

          {/* Canvas + scroll driver */}
          <div className="flex-1 relative overflow-hidden">

            {/* Canvas — no pointer events, full viewport size, redraws on demand */}
            <GanttCanvas
              ref={canvasRef}
              rows={rows}
              statuses={statuses}
              criticalSet={criticalSet}
              pxPerDay={pxPerDay}
              rangeStart={rangeStart}
              headerSegments={header}
              scrollTopRef={scrollTopRef}
              scrollLeftRef={scrollLeftRef}
              wrapperRef={scrollDriverRef}
              dragPreview={dragPreview}
            />

            {/* Transparent scroll driver — provides native scrollbars + all mouse events */}
            <div
              ref={scrollDriverRef}
              onScroll={handleScroll}
              onMouseDown={onDriverMouseDown}
              onMouseMove={onDriverMouseMove}
              onClick={onDriverClick}
              style={{ position: "absolute", inset: 0, overflow: "auto", cursor: "default" }}
            >
              {/* Spacer that defines the scrollable content size */}
              <div style={{ width: totalWidth, height: totalH, pointerEvents: "none" }} />
            </div>
          </div>
        </div>
      </div>

      {/* No-dates shelf */}
      {undated.length > 0 && (
        <div className="flex-shrink-0 border-t px-4 py-2 bg-muted/20 text-xs text-muted-foreground">
          <span className="font-medium">{undated.length} task{undated.length !== 1 ? "s" : ""} with no dates</span>
          <span className="ml-1">— assign a start or due date to show on the timeline.</span>
        </div>
      )}
    </div>
  );
}
