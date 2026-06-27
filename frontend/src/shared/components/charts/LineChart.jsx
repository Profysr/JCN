import { useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import './chartSetup';
import { chartColors, hexAlpha } from './chartTheme';
import { getChartColor } from './chartPalette';

/**
 * Multi-series line / area chart.
 *
 * Covers: burnup (two lines + today marker), CFD (stacked area),
 * any trend over time.
 *
 * Props:
 *   series      [{ name, data, color?, fill?: boolean, dashed?: boolean, tension?: number }]
 *   labels      string[]               — x-axis labels (one per data point)
 *   stacked?    boolean               — stack areas (for CFD-style charts)
 *   markers?    [{ xLabel, label?, color? }]  — vertical reference lines
 *   yTitle?     string
 *   height?     number                 — canvas height in px (default 280)
 *   xFormatter? (label: string) => string   — format x-axis tick labels
 *   showLegend? boolean               — show legend row (default true when >1 series)
 */
export default function LineChart({
  series = [],
  labels = [],
  stacked = false,
  markers = [],
  yTitle,
  height = 280,
  xFormatter,
  showLegend,
}) {
  const c = chartColors();
  const autoShowLegend = showLegend ?? series.length > 1;

  // ── Vertical marker plugin (e.g. "Today" line in burnup) ─────────────────
  const markerPlugin = useMemo(() => {
    if (!markers.length) return null;
    return {
      id: 'lineChartMarkers',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        markers.forEach(({ xLabel, label, color = '#94a3b8' }) => {
          const idx = labels.indexOf(xLabel);
          if (idx < 0) return;
          const x = scales.x.getPixelForValue(idx);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.strokeStyle = color;
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (label) {
            ctx.fillStyle = color;
            ctx.font = '10px inherit';
            ctx.textAlign = 'left';
            ctx.fillText(label, x + 4, chartArea.top + 14);
          }
          ctx.restore();
        });
      },
    };
  }, [markers, labels]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => ({
    labels,
    datasets: series.map((s, i) => {
      const color = s.color || getChartColor(i);
      return {
        label: s.name,
        data: s.data,
        borderColor: color,
        borderWidth: s.dashed ? 2 : 2.5,
        borderDash: s.dashed ? [5, 3] : [],
        backgroundColor: s.fill ? hexAlpha(color, stacked ? 0.75 : 0.12) : 'transparent',
        fill: s.fill ?? false,
        tension: s.tension ?? 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
      };
    }),
  }), [series, labels, stacked]);

  // ── Options ───────────────────────────────────────────────────────────────
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.popover,
          borderColor: c.border,
          borderWidth: 1,
          titleColor: c.foreground,
          bodyColor: c.mutedForeground,
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => xFormatter
              ? xFormatter(items[0]?.label || '')
              : items[0]?.label || '',
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: c.mutedForeground,
            font: { size: 10 },
            maxTicksLimit: 10,
            callback: xFormatter
              ? (val) => xFormatter(labels[val] || '')
              : undefined,
          },
          border: { display: false },
        },
        y: {
          stacked,
          beginAtZero: true,
          grid: { color: c.border, borderDash: [4, 4], drawBorder: false },
          ticks: {
            color: c.mutedForeground,
            font: { size: 10 },
            precision: 0,
            callback: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v),
          },
          ...(yTitle && {
            title: {
              display: true,
              text: yTitle,
              color: c.mutedForeground,
              font: { size: 10, weight: 'bold' },
            },
          }),
          border: { display: false },
        },
      },
    }),
    [stacked, yTitle, xFormatter, labels, c],
  );

  if (!series.length) return null;

  const plugins = markerPlugin ? [markerPlugin] : [];

  return (
    <div className="flex flex-col w-full">
      {/* Legend */}
      {autoShowLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
          {series.map((s, i) => {
            const color = s.color || getChartColor(i);
            return (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  className="w-5 h-0.5 shrink-0 rounded-full"
                  style={{
                    border: s.dashed ? `2px dashed ${color}` : 'none',
                    background: s.dashed ? 'none' : color,
                    height: s.dashed ? 0 : '2px',
                  }}
                />
                <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                  {s.name}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Canvas */}
      <div className="w-full relative" style={{ height }}>
        <Line data={chartData} options={options} plugins={plugins} />
      </div>
    </div>
  );
}
