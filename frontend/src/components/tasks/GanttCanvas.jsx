/**
 * GanttCanvas
 * -----------
 * Pure canvas renderer for the Gantt bar area.
 *
 * Design principles:
 *  - 1 <canvas> element, sized to the visible viewport (not total content).
 *  - Virtualized: only rows within [scrollTop, scrollTop+H] are drawn.
 *  - Virtualized columns: only grid lines / bars in [scrollLeft, scrollLeft+W] are drawn.
 *  - DPR-aware: canvas physical pixels = logical pixels × devicePixelRatio.
 *  - Zero React re-renders on scroll — parent calls ref.redraw() directly.
 *  - Drag preview: parent manages drag state, passes dragPreview prop.
 *
 * Parent is responsible for:
 *  - The scroll driver (transparent div with overflow:auto) — provides scrollbars + mouse events.
 *  - Calling ref.redraw() on every scroll tick.
 *  - Hit-testing and drag state management (see GanttView.jsx).
 */

import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  parseDate, dateKey, daysBetween, addDays,
  GROUP_H, ROW_H,
} from "@/hooks/useGanttModel";

// ── Canvas drawing helpers ────────────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r = 4) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}

// Read theme colors from the DOM once per draw frame.
// Canvas cannot consume CSS custom properties directly,
// so we compute them from a hidden sentinel element or derive from dark-mode class.
function getTheme() {
  const dark = document.documentElement.classList.contains("dark");
  return {
    bg:            dark ? "#09090b" : "#ffffff",
    rowAlt:        dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.015)",
    groupBg:       dark ? "rgba(255,255,255,0.04)"  : "rgba(0,0,0,0.025)",
    statusBg:      dark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.015)",
    gridLine:      dark ? "rgba(255,255,255,0.18)"  : "rgba(0,0,0,0.15)",
    gridMaj:       dark ? "rgba(255,255,255,0.35)"  : "rgba(0,0,0,0.28)",
    shading:       dark ? "rgba(99,102,241,0.09)"   : "rgba(99,102,241,0.07)",
    currentBorder: dark ? "rgba(99,102,241,0.40)"   : "rgba(99,102,241,0.35)",
    todayLine:     "rgba(248,113,113,0.8)",
    todayFill:     "rgb(248,113,113)",
    text:          dark ? "#e2e8f0" : "#1e293b",
    textMuted:     dark ? "#475569" : "#94a3b8",
    textOnBar:     "#ffffff",
    arrowLine:     dark ? "#475569" : "#94a3b8",
    arrowFill:     dark ? "#475569" : "#94a3b8",
    outOfRangeFill: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
  };
}

const BAR_H        = 22;
const SPRINT_BAR_H = 26;
const FONT         = '500 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

// ── Component ─────────────────────────────────────────────────────────────────
const GanttCanvas = forwardRef(function GanttCanvas(
  {
    rows,            // [{ type, id, y, h, sprint?, task?, expanded, ... }]
    statuses,        // board statuses — for bar colors
    criticalSet,     // Set<taskId> — highlighted in amber
    pxPerDay,        // pixels per calendar day (zoom level)
    rangeStart,      // Date — left edge of the canvas timeline
    headerSegments,  // { bottom: [{x, w, monthBoundary, current}] } — from buildHeader()
    scrollTopRef,    // React ref holding current scrollTop (no re-render on scroll)
    scrollLeftRef,   // React ref holding current scrollLeft
    wrapperRef,      // ref to the scroll-driver div (provides clientWidth/clientHeight)
    dragPreview,     // { taskId, type: "move"|"resize", deltaDays } | null
  },
  ref,
) {
  const canvasRef = useRef(null);
  const drawRef   = useRef(null); // stable pointer so resize observer can call it

  // ── Core draw function ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas  = canvasRef.current;
    const wrapper = wrapperRef?.current;
    if (!canvas || !wrapper) return;

    const dpr = window.devicePixelRatio || 1;
    const W   = wrapper.clientWidth;
    const H   = wrapper.clientHeight;
    if (!W || !H) return;

    // Resize backing store if viewport changed
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = W + "px";
      canvas.style.height = H + "px";
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sT = scrollTopRef.current;
    const sL = scrollLeftRef.current;
    const C  = getTheme();

    // 1 ── Background ─────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // 2 ── Current-period shading + accent borders ────────────────────────────
    if (headerSegments?.bottom) {
      for (const seg of headerSegments.bottom) {
        if (!seg.current) continue;
        const sx = seg.x - sL;
        if (sx + seg.w < 0 || sx > W) continue;
        ctx.fillStyle = C.shading;
        ctx.fillRect(sx, 0, seg.w, H);
        // Left + right accent border for the current timeframe
        ctx.strokeStyle = C.currentBorder;
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        for (const bx of [sx + 0.5, sx + seg.w - 0.5]) {
          if (bx >= -1 && bx <= W + 1) {
            ctx.beginPath();
            ctx.moveTo(bx, 0);
            ctx.lineTo(bx, H);
            ctx.stroke();
          }
        }
      }
    }

    // 3 ── Vertical grid lines ─────────────────────────────────────────────────
    if (headerSegments?.bottom) {
      for (const seg of headerSegments.bottom) {
        const sx = seg.x - sL;
        if (sx < -1 || sx > W + 1) continue;
        ctx.strokeStyle = seg.monthBoundary ? C.gridMaj : C.gridLine;
        ctx.lineWidth   = 0.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
        ctx.stroke();
      }
    }

    // 4 ── Binary-search first visible row ────────────────────────────────────
    let startIdx = rows.length;
    {
      let lo = 0, hi = rows.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].y + rows[mid].h <= sT) lo = mid + 1;
        else { startIdx = mid; hi = mid - 1; }
      }
    }

    // 5 ── Row backgrounds + horizontal separators ─────────────────────────────
    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const ry  = row.y - sT;
      if (ry > H) break;

      if (row.type === "sprint") {
        ctx.fillStyle = C.groupBg;
        ctx.fillRect(0, ry, W, row.h);
      } else if (row.type === "status") {
        ctx.fillStyle = C.statusBg;
        ctx.fillRect(0, ry, W, row.h);
      } else if (i % 2 === 1) {
        ctx.fillStyle = C.rowAlt;
        ctx.fillRect(0, ry, W, row.h);
      }

      ctx.strokeStyle = C.gridLine;
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, ry + row.h - 0.5);
      ctx.lineTo(W, ry + row.h - 0.5);
      ctx.stroke();
    }

    // 6 ── Today line ──────────────────────────────────────────────────────────
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const todayX = daysBetween(rangeStart, today) * pxPerDay - sL;
    if (todayX >= 0 && todayX <= W) {
      ctx.strokeStyle = C.todayLine;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(todayX, 0);
      ctx.lineTo(todayX, H);
      ctx.stroke();
      ctx.fillStyle = C.todayFill;
      ctx.beginPath();
      ctx.arc(todayX, 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 7 ── Bars ────────────────────────────────────────────────────────────────
    ctx.font = FONT;

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      const ry  = row.y - sT;
      if (ry > H) break;

      // ── Sprint bar ──────────────────────────────────────────────────────────
      if (row.type === "sprint") {
        const { sprint } = row;
        const sd = parseDate(sprint.start_date);
        const ed = parseDate(sprint.end_date);
        if (!sd || !ed) continue;

        const bxAbs = daysBetween(rangeStart, sd) * pxPerDay;
        const bwAbs = (daysBetween(sd, ed) + 1) * pxPerDay;
        const bxScr = bxAbs - sL;

        if (bxScr + bwAbs < 0 || bxScr > W) continue;

        const barColor =
          sprint.status === "completed" ? "#10b981"
          : sprint.status === "active"  ? "#6366f1"
          :                               "#94a3b8";

        const barY = ry + (GROUP_H - SPRINT_BAR_H) / 2;

        ctx.fillStyle = barColor + "22";
        roundRect(ctx, bxScr, barY, bwAbs, SPRINT_BAR_H, 5);
        ctx.fill();

        ctx.strokeStyle = barColor + "66";
        ctx.lineWidth   = 1;
        roundRect(ctx, bxScr, barY, bwAbs, SPRINT_BAR_H, 5);
        ctx.stroke();

        // Left accent stripe
        ctx.fillStyle = barColor;
        ctx.fillRect(Math.max(bxScr, bxScr), barY, 3, SPRINT_BAR_H);

        // Sprint name
        if (bwAbs > 48) {
          ctx.fillStyle = C.text;
          ctx.save();
          ctx.beginPath();
          ctx.rect(Math.max(bxScr + 10, 1), barY + 1, bwAbs - 14, SPRINT_BAR_H - 2);
          ctx.clip();
          ctx.fillText(sprint.name, bxScr + 12, barY + SPRINT_BAR_H / 2 + 4);
          ctx.restore();
        }

        // Progress badge (e.g. "3/8") on the right side of the bar
        const done  = sprint.completed_count ?? 0;
        const total = sprint.task_count ?? 0;
        if (total > 0 && bwAbs > 100) {
          const badge  = `${done}/${total}`;
          const badgeW = ctx.measureText(badge).width + 10;
          const badgeX = bxScr + bwAbs - badgeW - 6;
          if (badgeX > bxScr + 40) {
            ctx.fillStyle = barColor + "33";
            roundRect(ctx, badgeX, barY + 5, badgeW, 16, 3);
            ctx.fill();
            ctx.fillStyle = barColor;
            ctx.fillText(badge, badgeX + 5, barY + SPRINT_BAR_H / 2 + 4);
          }
        }
        continue;
      }

      // ── Status group — no bar, just the background drawn in section 5 ──────
      if (row.type === "status") continue;

      // ── Task bar ───────────────────────────────────────────────────────────
      if (row.type === "task") {
        const { task }       = row;
        const isPrev         = dragPreview?.taskId === task.id;
        const dd             = isPrev ? dragPreview.deltaDays : 0;
        const dType          = isPrev ? dragPreview.type : "move";

        const sd = parseDate(task.start_date || task.due_date);
        const ed = parseDate(task.due_date   || task.start_date);
        if (!sd) continue;

        let bxAbs = daysBetween(rangeStart, sd) * pxPerDay;
        let bwAbs = Math.max(pxPerDay, (daysBetween(sd, ed) + 1) * pxPerDay);

        if (dType === "move")   bxAbs += dd * pxPerDay;
        if (dType === "resize") bwAbs  = Math.max(pxPerDay, bwAbs + dd * pxPerDay);

        const bxScr = bxAbs - sL;
        if (bxScr + bwAbs < 0 || bxScr > W) continue;

        const barY  = ry + (ROW_H - BAR_H) / 2;
        const color =
          criticalSet?.has(task.id)
            ? "#f59e0b"
            : (statuses.find(s => s.id === task.status_id)?.color || "#6366f1");

        // Out-of-sprint-range: task dates fall entirely before sprint start
        // or entirely after sprint end — render muted with dashed border
        const taskEnd   = task.due_date   || task.start_date;
        const taskStart = task.start_date || task.due_date;
        const isOutOfRange = row.sprintStart && (
          (taskEnd   && taskEnd   < row.sprintStart) ||
          (taskStart && row.sprintEnd && taskStart > row.sprintEnd)
        );

        if (isOutOfRange) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle   = C.outOfRangeFill;
          roundRect(ctx, bxScr, barY, bwAbs, BAR_H, 3);
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([4, 3]);
          roundRect(ctx, bxScr, barY, bwAbs, BAR_H, 3);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          continue;
        }

        if (isPrev) ctx.globalAlpha = 0.75;
        ctx.fillStyle = color;
        roundRect(ctx, bxScr, barY, bwAbs, BAR_H, 3);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label inside bar
        if (bwAbs > 24) {
          ctx.fillStyle = C.textOnBar;
          ctx.save();
          ctx.beginPath();
          ctx.rect(Math.max(bxScr + 6, 0), barY, Math.min(bwAbs - 12, W), BAR_H);
          ctx.clip();
          ctx.fillText(task.title, Math.max(bxScr + 6, 4), barY + BAR_H / 2 + 4);
          ctx.restore();
        }

        // Drag-preview date tooltip
        if (isPrev) {
          const base  = dType === "resize"
            ? (task.due_date   || task.start_date)
            : (task.start_date || task.due_date);
          if (base) {
            const label  = dateKey(addDays(parseDate(base), dd));
            const labelW = ctx.measureText(label).width;
            const tipX   = Math.min(Math.max(bxScr, 2), W - labelW - 16);
            const tipY   = barY - 22;
            ctx.fillStyle = C.text;
            roundRect(ctx, tipX, tipY, labelW + 12, 16, 3);
            ctx.fill();
            ctx.fillStyle = C.bg;
            ctx.fillText(label, tipX + 6, tipY + 11);
          }
        }
      }
    }

    // 8 ── Dependency arrows ────────────────────────────────────────────────────
    const taskRowMap = new Map(
      rows.filter(r => r.type === "task").map(r => [r.task.id, r])
    );

    ctx.strokeStyle = C.arrowLine;
    ctx.lineWidth   = 1.2;
    ctx.setLineDash([4, 3]);

    for (let i = startIdx; i < rows.length; i++) {
      const row = rows[i];
      if (row.type !== "task") continue;
      const ry = row.y - sT;
      if (ry > H + 60) break;

      const { task } = row;
      for (const bid of (task.blocked_by_ids || [])) {
        const bRow = taskRowMap.get(bid);
        if (!bRow) continue;

        const bt  = bRow.task;
        const bsd = parseDate(bt.start_date || bt.due_date);
        const bed = parseDate(bt.due_date   || bt.start_date);
        const tsd = parseDate(task.start_date || task.due_date);
        if (!bsd || !tsd) continue;

        const x1 = (daysBetween(rangeStart, bed || bsd) + 1) * pxPerDay - sL;
        const y1 = bRow.y - sT + ROW_H / 2;
        const x2 = daysBetween(rangeStart, tsd) * pxPerDay - sL;
        const y2 = ry + ROW_H / 2;

        if ((x1 < 0 && x2 < 0) || (x1 > W && x2 > W)) continue;

        const cx = Math.abs(x2 - x1) * 0.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1 + cx, y1, x2 - cx, y2, x2, y2);
        ctx.stroke();

        // Arrowhead
        ctx.setLineDash([]);
        ctx.fillStyle = C.arrowFill;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 6, y2 - 3);
        ctx.lineTo(x2 - 6, y2 + 3);
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([4, 3]);
      }
    }
    ctx.setLineDash([]);

  }, [rows, statuses, criticalSet, pxPerDay, rangeStart, headerSegments, dragPreview, scrollTopRef, scrollLeftRef, wrapperRef]);

  // Keep drawRef current so resize observer and imperative handle always call latest version
  drawRef.current = draw;

  // Expose redraw() to parent via forwarded ref
  useImperativeHandle(ref, () => ({
    redraw: () => requestAnimationFrame(() => drawRef.current?.()),
  }), []);

  // Re-draw when any data dependency changes
  useEffect(() => {
    requestAnimationFrame(() => drawRef.current?.());
  }, [draw]);

  // Re-draw on viewport resize
  useEffect(() => {
    const wrapper = wrapperRef?.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => requestAnimationFrame(() => drawRef.current?.()));
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [wrapperRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
    />
  );
});

export default GanttCanvas;
