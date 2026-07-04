/**
 * Centralized date helpers + calendar label arrays.
 * Import from here — do NOT redefine `parseDate` / `addDays` / month arrays locally.
 * These were previously duplicated across useGanttModel and CalendarView.
 */

// ── Calendar labels ───────────────────────────────────────────────────────────
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTH_NAMES_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Parsing / keys ────────────────────────────────────────────────────────────

/** Parse a "YYYY-MM-DD" string into a local Date (no TZ shift). null-safe. */
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Date → "YYYY-MM-DD" (local). */
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Arithmetic ────────────────────────────────────────────────────────────────
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── Comparisons ───────────────────────────────────────────────────────────────
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d) {
  return isSameDay(d, new Date());
}

// ── Formatting ────────────────────────────────────────────────────────────────

/**
 * Format a date as "Mon d" (e.g. "Jun 23"). Accepts a "YYYY-MM-DD" string or Date.
 * Returns null for empty input so callers can branch on it.
 */
export function formatShortDate(value) {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value + "T00:00:00") : value;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Urgency bucketing ─────────────────────────────────────────────────────────
// Was duplicated identically in MyWorkPage and DashboardsPage — bucket ids
// match URGENCY_SECTIONS in @/shared/lib/constants.
export function getTaskUrgency(task) {
  if (!task.due_date) return "no_date";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = addDays(today, 7);
  const d = new Date(task.due_date + "T00:00:00");
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  if (d <= weekEnd) return "this_week";
  return "later";
}
