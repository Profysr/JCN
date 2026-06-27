/**
 * Shared 32-color chart palette — ordered for maximum perceptual contrast
 * between adjacent series. Import CHART_PALETTE wherever you need colors,
 * and use getChartColor(index) to cycle safely beyond 32 entries.
 */

export const CHART_PALETTE = [
  // ── Round 1: primary hues, high saturation ──────────────────────────────
  '#6366f1', // indigo-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#0ea5e9', // sky-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#22c55e', // green-500

  // ── Round 2: darker shades, still distinct ──────────────────────────────
  '#4f46e5', // indigo-600
  '#059669', // emerald-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#0284c7', // sky-600
  '#7c3aed', // violet-600
  '#db2777', // pink-600
  '#0d9488', // teal-600
  '#ea580c', // orange-600
  '#16a34a', // green-600

  // ── Round 3: lighter tints for fill areas / secondary series ────────────
  '#818cf8', // indigo-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#f87171', // red-400
  '#38bdf8', // sky-400
  '#a78bfa', // violet-400
  '#f472b6', // pink-400
  '#2dd4bf', // teal-400
  '#fb923c', // orange-400
  '#4ade80', // green-400

  // ── Round 4: accent hues to fill out 32 ────────────────────────────────
  '#06b6d4', // cyan-500
  '#84cc16', // lime-500
];

/** Safely cycle through the palette regardless of series count. */
export function getChartColor(index) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}
