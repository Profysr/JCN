import { useMemo } from "react";

// ── Row heights ───────────────────────────────────────────────────────────────
export const GROUP_H = 40;
export const ROW_H   = 36;

// ── Date helpers (exported so GanttCanvas can reuse without duplication) ──────
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
export function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// ── Range covers all task + sprint dates with padding ─────────────────────────
export function computeRange(tasks, sprints) {
  const dates = [];
  for (const t of tasks) {
    if (t.start_date) dates.push(parseDate(t.start_date));
    if (t.due_date)   dates.push(parseDate(t.due_date));
  }
  for (const s of sprints) {
    if (s.start_date) dates.push(parseDate(s.start_date));
    if (s.end_date)   dates.push(parseDate(s.end_date));
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (dates.length === 0) return { start: addDays(today, -30), end: addDays(today, 120) };
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  return { start: addDays(min, -14), end: addDays(max, 90) };
}

// ── Critical path (longest dependency chain) ──────────────────────────────────
export function computeCriticalPath(tasks) {
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

// ── Main model hook ───────────────────────────────────────────────────────────
// Returns a flat ordered array of rows with cumulative y positions.
// Structure:
//   Sprint rows (collapsed by default) → task rows when expanded
//   Ongoing row (tasks with no sprint_id) → task rows when expanded
//   undated: tasks with neither date (shown in bottom shelf)
export function useGanttModel(tasks, sprints, collapsedSet) {
  return useMemo(() => {
    const rows = [];
    let y = 0;

    // Sprints sorted by start_date ascending
    const sortedSprints = [...sprints].sort((a, b) =>
      (a.start_date || "9999").localeCompare(b.start_date || "9999")
    );

    for (const sprint of sortedSprints) {
      const sprintTasks = tasks
        .filter(t => t.sprint_id === sprint.id && (t.start_date || t.due_date))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      const expanded = !collapsedSet.has(sprint.id);
      rows.push({
        type: "sprint", id: sprint.id, sprint,
        expanded, taskCount: sprintTasks.length, y, h: GROUP_H,
      });
      y += GROUP_H;

      if (expanded) {
        for (const task of sprintTasks) {
          rows.push({ type: "task", id: task.id, task, parentId: sprint.id, y, h: ROW_H });
          y += ROW_H;
        }
      }
    }

    // Ongoing: tasks with no sprint_id that have at least one date
    const ongoing = tasks
      .filter(t => !t.sprint_id && (t.start_date || t.due_date))
      .sort((a, b) =>
        (a.start_date || a.due_date || "").localeCompare(b.start_date || b.due_date || "")
      );

    if (ongoing.length > 0) {
      const expanded = !collapsedSet.has("__ongoing__");
      rows.push({
        type: "ongoing", id: "__ongoing__", label: "Ongoing",
        expanded, taskCount: ongoing.length, y, h: GROUP_H,
      });
      y += GROUP_H;
      if (expanded) {
        for (const task of ongoing) {
          rows.push({ type: "task", id: task.id, task, parentId: "__ongoing__", y, h: ROW_H });
          y += ROW_H;
        }
      }
    }

    // Tasks with no dates at all — shown in a shelf, not on the canvas
    const undated = tasks.filter(t => !t.start_date && !t.due_date);

    return { rows, undated, totalH: Math.max(y, 400) };
  }, [tasks, sprints, collapsedSet]);
}

// ── Binary search: first row index whose bottom edge is > scrollTop ───────────
export function firstVisibleIdx(rows, scrollTop) {
  let lo = 0, hi = rows.length - 1, result = rows.length;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].y + rows[mid].h <= scrollTop) lo = mid + 1;
    else { result = mid; hi = mid - 1; }
  }
  return result;
}
