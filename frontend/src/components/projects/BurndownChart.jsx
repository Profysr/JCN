import { useMemo } from "react";

export default function BurndownChart({ data, height = 180 }) {
  const { days = [], ideal = [], actual = [] } = data || {};

  const allValues = [...ideal, ...actual.filter(v => v !== null)];
  const maxVal = Math.max(...allValues, 1);
  const W = 100; // viewBox units (percentage-based)
  const H = 100;
  const PAD = { top: 8, right: 4, bottom: 20, left: 24 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const n = days.length;

  const xOf = (i) => PAD.left + (i / Math.max(n - 1, 1)) * chartW;
  const yOf = (v) => PAD.top + (1 - v / maxVal) * chartH;

  const idealPath = useMemo(() => {
    if (!ideal.length) return "";
    return ideal.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(2)},${yOf(v).toFixed(2)}`).join(" ");
  }, [ideal]);

  const actualPoints = actual
    .map((v, i) => (v !== null ? { x: xOf(i), y: yOf(v), i } : null))
    .filter(Boolean);

  const actualPath = useMemo(() => {
    if (!actualPoints.length) return "";
    return actualPoints.map((p, idx) => `${idx === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  }, [actualPoints]);

  // Y-axis tick marks
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  // X-axis labels — show first, mid, last
  const xLabels = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ height, width: "100%" }} className="overflow-visible">
      {/* Grid lines */}
      {yTicks.map((v) => (
        <line
          key={v}
          x1={PAD.left} x2={PAD.left + chartW}
          y1={yOf(v)}   y2={yOf(v)}
          stroke="currentColor" strokeOpacity={0.08} strokeWidth={0.5}
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((v) => (
        <text key={v} x={PAD.left - 2} y={yOf(v) + 1.5} textAnchor="end" fontSize={5} fill="currentColor" opacity={0.5}>
          {v}
        </text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((i) => (
        <text key={i} x={xOf(i)} y={H - PAD.bottom + 6} textAnchor="middle" fontSize={4.5} fill="currentColor" opacity={0.5}>
          {days[i]}
        </text>
      ))}

      {/* Ideal line (dashed) */}
      {idealPath && (
        <path d={idealPath} fill="none" stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2,1.5" opacity={0.7} />
      )}

      {/* Actual line */}
      {actualPath && (
        <path d={actualPath} fill="none" stroke="#6366f1" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      )}

      {/* Actual data points */}
      {actualPoints.map((p) => (
        <circle key={p.i} cx={p.x} cy={p.y} r={1.2} fill="#6366f1" />
      ))}

      {/* Legend */}
      <g transform={`translate(${PAD.left + 2}, ${PAD.top})`}>
        <line x1={0} x2={6} y1={2} y2={2} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2,1.5" opacity={0.7} />
        <text x={8} y={3.5} fontSize={4} fill="currentColor" opacity={0.6}>Ideal</text>
        <line x1={20} x2={26} y1={2} y2={2} stroke="#6366f1" strokeWidth={1.2} />
        <text x={28} y={3.5} fontSize={4} fill="currentColor" opacity={0.6}>Actual</text>
      </g>
    </svg>
  );
}
