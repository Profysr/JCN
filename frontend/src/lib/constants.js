/**
 * Centralized app-wide constants.
 * Import from here — do NOT redefine locally in components.
 */

import {
  AlertCircle,
  ChevronUp,
  ArrowDown,
  Minus,
  ChevronsUp,
  CheckSquare,
  Bug,
  Sparkles,
  BookOpen,
  TrendingUp,
  HelpCircle,
  Layers,
} from "lucide-react";

// ── Priority ──────────────────────────────────────────────────────────────────
// Single canonical definition consumed by every component that needs priority UI.
export const PRIORITIES = [
  {
    value: "no_priority",
    label: "No Priority",
    order: 4, // sort index (lower = more urgent)
    icon: Minus,
    textCls: "text-muted-foreground",
    dotCls: "bg-muted-foreground/30",
    hex: "#94a3b8",
    filterActiveCls: "text-slate-600 bg-slate-500/10 border-slate-400/50",
    modalBtnCls: "border-input text-muted-foreground",
  },
  {
    value: "low",
    label: "Low",
    order: 3,
    icon: ArrowDown,
    textCls: "text-blue-500",
    dotCls: "bg-blue-400",
    hex: "#60a5fa",
    filterActiveCls: "text-blue-600 bg-blue-500/10 border-blue-400/50",
    modalBtnCls: "border-blue-300 text-blue-600 bg-blue-50",
  },
  {
    value: "medium",
    label: "Medium",
    order: 2,
    icon: Minus,
    textCls: "text-yellow-500",
    dotCls: "bg-yellow-400",
    hex: "#eab308",
    filterActiveCls: "text-yellow-600 bg-yellow-500/10 border-yellow-400/50",
    modalBtnCls: "border-yellow-300 text-yellow-600 bg-yellow-50",
  },
  {
    value: "high",
    label: "High",
    order: 1,
    icon: ChevronUp,
    textCls: "text-orange-500",
    dotCls: "bg-orange-500",
    hex: "#f97316",
    filterActiveCls: "text-orange-600 bg-orange-500/10 border-orange-400/50",
    modalBtnCls: "border-orange-300 text-orange-600 bg-orange-50",
  },
  {
    value: "urgent",
    label: "Urgent",
    order: 0,
    icon: ChevronsUp,
    textCls: "text-red-500",
    dotCls: "bg-red-500",
    hex: "#ef4444",
    filterActiveCls: "text-red-600 bg-red-500/10 border-red-400/50",
    modalBtnCls: "border-red-300 text-red-600 bg-red-50",
  },
];

/** Look up a priority config by value. Always returns a valid object. */
export function getPriority(value) {
  return PRIORITIES.find((p) => p.value === value) ?? PRIORITIES[0];
}

/** Sort order map — use for array.sort comparisons. */
export const PRIORITY_ORDER = Object.fromEntries(
  PRIORITIES.map((p) => [p.value, p.order]),
);

// ── Project / sprint / label colour palette ───────────────────────────────────
// Same 8-colour set used by projects, roadmap, labels, avatars.
export const APP_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#14b8a6",
  "#ef4444",
];

/** Pick a colour deterministically from a string (e.g. project name). */
export function pickColor(str = "") {
  let hash = 0;
  for (let i = 0; i < str.length; i++)
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return APP_COLORS[Math.abs(hash) % APP_COLORS.length];
}

// ── Label colour swatches ─────────────────────────────────────────────────────
export const LABEL_COLORS = [
  "#6366f1",
  "#ec4899",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#8b5cf6",
  "#14b8a6",
];

// ── Task types — always import from here, not from @/lib/taskTypes directly ───
export const TASK_TYPES = [
  {
    value: "task",
    label: "Task",
    icon: CheckSquare,
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-500/15",
  },
  {
    value: "epic",
    label: "Epic",
    icon: Layers,
    color: "text-purple-500 dark:text-purple-400",
    bg: "bg-purple-500/15",
  },
  {
    value: "bug",
    label: "Bug",
    icon: Bug,
    color: "text-red-500 dark:text-red-400",
    bg: "bg-red-500/15",
  },
  {
    value: "feature",
    label: "Feature",
    icon: Sparkles,
    color: "text-violet-500 dark:text-violet-400",
    bg: "bg-violet-500/15",
  },
  {
    value: "story",
    label: "Story",
    icon: BookOpen,
    color: "text-blue-500 dark:text-blue-400",
    bg: "bg-blue-500/15",
  },
  {
    value: "improvement",
    label: "Improvement",
    icon: TrendingUp,
    color: "text-emerald-500 dark:text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  {
    value: "question",
    label: "Question",
    icon: HelpCircle,
    color: "text-orange-500 dark:text-orange-400",
    bg: "bg-orange-500/15",
  },
];

export const getTaskType = (value) =>
  TASK_TYPES.find((t) => t.value === value) || TASK_TYPES[0];

// ── Sprint statuses ───────────────────────────────────────────────────────────
export const SPRINT_STATUSES = {
  planning: {
    value: "planning",
    label: "Planning",
    badgeCls: "text-muted-foreground bg-muted border-border",
  },
  active: {
    value: "active",
    label: "Active",
    badgeCls:
      "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  completed: {
    value: "completed",
    label: "Completed",
    badgeCls:
      "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  },
};

/** Look up a sprint status config by value. Always returns a valid object. */
export function getSprintStatus(value) {
  return SPRINT_STATUSES[value] ?? SPRINT_STATUSES.planning;
}

// ── Appearance ────────────────────────────────────────────────────────────────

export const THEMES = [
  { value: "light", label: "Light", preview: "bg-white border-gray-200" },
  { value: "dark", label: "Dark", preview: "bg-gray-900 border-gray-700" },
  {
    value: "midnight",
    label: "Midnight",
    preview: "bg-slate-950 border-slate-800",
  },
];

export const ACCENT_COLORS = {
  indigo: { label: "Indigo", hex: "#6366f1" },
  blue: { label: "Blue", hex: "#3b82f6" },
  violet: { label: "Violet", hex: "#8b5cf6" },
  pink: { label: "Pink", hex: "#ec4899" },
  rose: { label: "Rose", hex: "#f43f5e" },
  amber: { label: "Amber", hex: "#f59e0b" },
  emerald: { label: "Emerald", hex: "#10b981" },
  cyan: { label: "Cyan", hex: "#06b6d4" },
  slate: { label: "Slate", hex: "#64748b" },
};

export const DENSITIES = [
  { value: "comfortable", label: "Comfortable" },
  { value: "cozy", label: "Cozy" },
  { value: "compact", label: "Compact" },
];

// ── Focus mode ────────────────────────────────────────────────────────────────

export const FOCUS_DURATIONS = [
  { key: "1h", label: "1 hour", hours: 1 },
  { key: "4h", label: "4 hours", hours: 4 },
  { key: "8h", label: "8 hours", hours: 8 },
];
