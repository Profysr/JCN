import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import './chartSetup';
import { chartColors } from './chartTheme';
import { getChartColor } from './chartPalette';
import { useThemeKey } from './useThemeKey';

/**
 * Scatter plot with optional stat pills and a horizontal reference line.
 *
 * Covers: cycle time (points by priority + median line + stat pills),
 * any x/y distribution grouped into labelled series.
 *
 * Props:
 *   datasets         [{ label, data: [{x, y, meta?}], color? }]
 *   referenceLine?   { y: number, label?: string, color?: string }
 *   statPills?       [{ label: string, value: string | number }]
 *   xTitle?          string
 *   yTitle?          string
 *   height?          number   (default 300)
 *   tooltipFormatter? (point: {x, y, meta}) => string[]   — extra lines in tooltip
 */
export default function ScatterChart({
  datasets = [],
  referenceLine,
  statPills = [],
  xTitle,
  yTitle,
  height = 300,
  tooltipFormatter,
}) {
  const themeKey = useThemeKey();
  const c = chartColors();

  // ── Reference line plugin ─────────────────────────────────────────────────
  const refLinePlugin = useMemo(() => {
    if (!referenceLine) return null;
    const { y, label, color = '#f59e0b' } = referenceLine;
    return {
      id: 'scatterReferenceLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!scales.y) return;
        const yPixel = scales.y.getPixelForValue(y);
        if (yPixel < chartArea.top || yPixel > chartArea.bottom) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(chartArea.left, yPixel);
        ctx.lineTo(chartArea.right, yPixel);
        ctx.strokeStyle = color;
        ctx.setLineDash([5, 3]);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        if (label) {
          ctx.fillStyle = color;
          ctx.font = 'bold 10px inherit';
          ctx.textAlign = 'right';
          ctx.fillText(label, chartArea.right - 4, yPixel - 4);
        }
        ctx.restore();
      },
    };
  }, [referenceLine]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => ({
    datasets: datasets.map((ds, i) => ({
      label: ds.label,
      data: ds.data,
      backgroundColor: ds.color || getChartColor(i),
      pointRadius: 5,
      pointHoverRadius: 7,
      pointStyle: 'circle',
    })),
  }), [datasets]);

  // ── Options ───────────────────────────────────────────────────────────────
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: {
            color: c.mutedForeground,
            boxWidth: 8,
            font: { size: 11 },
            usePointStyle: true,
            pointStyleWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: c.popover,
          borderColor: c.border,
          borderWidth: 1,
          titleColor: c.foreground,
          bodyColor: c.mutedForeground,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            label: (ctx) => {
              const point = ctx.raw;
              const base = ` (${point.x}, ${point.y})`;
              if (!tooltipFormatter) return base;
              const extras = tooltipFormatter(point);
              return [base, ...extras];
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: c.grid, borderDash: [4, 4], drawBorder: false },
          ticks: { color: c.mutedForeground, font: { size: 10 } },
          border: { display: false },
          ...(xTitle && {
            title: { display: true, text: xTitle, color: c.mutedForeground, font: { size: 10, weight: 'bold' } },
          }),
        },
        y: {
          beginAtZero: true,
          grid: { color: c.grid, borderDash: [4, 4], drawBorder: false },
          ticks: { color: c.mutedForeground, font: { size: 10 }, precision: 0 },
          border: { display: false },
          ...(yTitle && {
            title: { display: true, text: yTitle, color: c.mutedForeground, font: { size: 10, weight: 'bold' } },
          }),
        },
      },
    }),
    [datasets.length, xTitle, yTitle, tooltipFormatter, c],
  );

  if (!datasets.length) return null;

  const plugins = refLinePlugin ? [refLinePlugin] : [];

  return (
    <div className="flex flex-col w-full gap-3">
      {/* Stat pills */}
      {statPills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {statPills.map((pill) => (
            <div
              key={pill.label}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted border border-border"
            >
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {pill.label}
              </span>
              <span className="text-[12px] font-bold text-foreground tabular-nums">
                {pill.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div className="w-full relative" style={{ height }}>
        <Scatter key={themeKey} data={chartData} options={options} plugins={plugins} />
      </div>
    </div>
  );
}
