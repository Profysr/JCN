import { useMemo, useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './chartSetup';
import { chartColors } from './chartTheme';
import { getChartColor } from './chartPalette';
import { useThemeKey } from './useThemeKey';

/**
 * Generic bar chart — handles every bar-based use case:
 *
 *   • Single bar series (lead time buckets, completion rate)
 *   • Grouped bars (velocity: SP + Tasks side-by-side)
 *   • Bars + line overlay (throughput + avg line)
 *   • Per-bar threshold coloring via barColors()
 *   • Pagination when categories exceed barsPerPage
 *
 * Props:
 *   series        [{ name, data, color?, type?: 'bar'|'line', dashed?: boolean }]
 *   categories    string[]
 *   stacked?      boolean               — stack bars (default false = grouped)
 *   barsPerPage?  number                — paginate when > this many bars (default 20)
 *   yTitle?       string
 *   yMax?         number                — hard cap on y-axis (e.g. 100 for percentages)
 *   height?       number                — canvas height in px (default 280)
 *   horizontal?   boolean
 *   showLegend?   boolean               — show toggleable legend (default: auto when >1 bar series)
 *   barColors?    (value, index) => string   — per-bar color override for single series
 *   onBarClick?   (index) => void            — click a bar → drill in (index is into the full categories array)
 */
export default function BarChart({
  series = [],
  categories = [],
  stacked = false,
  barsPerPage = 20,
  yTitle,
  yMax,
  height = 280,
  horizontal = false,
  showLegend,
  barColors,
  onBarClick,
}) {
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const themeKey = useThemeKey();
  const c = chartColors();

  const barSeries = series.filter((s) => (s.type ?? 'bar') === 'bar');
  const autoShowLegend = showLegend ?? barSeries.length > 1;

  // ── Pagination ────────────────────────────────────────────────────────────
  const catLen = categories.length;
  const totalPages = Math.max(1, Math.ceil(catLen / barsPerPage));
  const endIndex = catLen - (totalPages - 1 - currentPage) * barsPerPage;
  const startIndex = Math.max(0, endIndex - barsPerPage);

  const paginatedCats = useMemo(
    () => categories.slice(startIndex, endIndex),
    [categories, startIndex, endIndex],
  );

  useEffect(() => {
    setCurrentPage(Math.max(0, Math.ceil(catLen / barsPerPage) - 1));
  }, [catLen, barsPerPage]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const datasets = series.map((s, i) => {
      const isLine = s.type === 'line';
      const color = s.color || getChartColor(i);
      const slice = s.data?.slice(startIndex, endIndex) ?? [];

      if (isLine) {
        return {
          type: 'line',
          label: s.name,
          data: slice,
          borderColor: color,
          borderWidth: 2,
          borderDash: s.dashed ? [5, 3] : [],
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
          hidden: hiddenSeries.has(s.name),
          datalabels: { display: false },
        };
      }

      const bgColor = barColors
        ? slice.map((v, idx) => barColors(v, startIndex + idx))
        : color;

      return {
        type: 'bar',
        label: s.name,
        data: slice,
        backgroundColor: bgColor,
        borderRadius: 4,
        maxBarThickness: stacked ? 56 : 40,
        hidden: hiddenSeries.has(s.name),
        ...(stacked ? { stack: 'combined' } : {}),
        datalabels: { display: false },
      };
    });

    return { labels: paginatedCats, datasets };
  }, [series, paginatedCats, startIndex, endIndex, hiddenSeries, stacked, barColors]);

  // ── Options ───────────────────────────────────────────────────────────────
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      onClick: onBarClick
        ? (_evt, els) => {
            if (els.length) onBarClick(startIndex + els[0].index);
          }
        : undefined,
      onHover: onBarClick
        ? (evt, els) => {
            evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
          }
        : undefined,
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: c.popover,
          borderColor: c.border,
          borderWidth: 1,
          titleColor: c.foreground,
          bodyColor: c.mutedForeground,
          padding: 10,
          cornerRadius: 8,
        },
      },
      scales: {
        x: {
          stacked,
          grid: { display: horizontal, color: c.grid, drawBorder: false },
          ticks: horizontal
            ? {
                font: { size: 10 },
                color: c.mutedForeground,
                callback: (v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v),
              }
            : {
                font: { size: 10 },
                color: c.mutedForeground,
                maxRotation: paginatedCats.length > 8 ? 45 : 0,
                minRotation: paginatedCats.length > 8 ? 45 : 0,
                autoSkip: false,
                callback(value) {
                  const label = this.getLabelForValue(value);
                  return typeof label === 'string' && label.length > 14
                    ? label.slice(0, 14) + '…'
                    : label;
                },
              },
          border: { display: false },
        },
        y: {
          stacked,
          beginAtZero: true,
          ...(yMax != null ? { max: yMax } : {}),
          grid: { display: !horizontal, color: c.grid, borderDash: [4, 4], drawBorder: false },
          ticks: horizontal
            ? {
                font: { size: 10 },
                color: c.mutedForeground,
                autoSkip: false,
                callback(value) {
                  const label = this.getLabelForValue(value);
                  return typeof label === 'string' && label.length > 14
                    ? label.slice(0, 14) + '…'
                    : label;
                },
              }
            : {
                font: { size: 10 },
                color: c.mutedForeground,
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
    [horizontal, stacked, yTitle, yMax, paginatedCats.length, c, onBarClick, startIndex],
  );

  if (!series.length) return null;

  const toggleSeries = (name) =>
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col w-full">
      {/* Legend */}
      {autoShowLegend && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
          {series.map((s, i) => {
            const isHidden = hiddenSeries.has(s.name);
            const isLine = s.type === 'line';
            const color = s.color || getChartColor(i);
            return (
              <button
                key={s.name}
                onClick={() => toggleSeries(s.name)}
                className={`flex items-center gap-1.5 transition-all duration-200 ${
                  isHidden ? 'opacity-35 grayscale' : 'opacity-100 hover:opacity-70'
                }`}
              >
                {isLine ? (
                  <span
                    className="w-5 h-0.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: color,
                      borderTop: s.dashed ? `2px dashed ${color}` : undefined,
                      background: s.dashed ? 'none' : color,
                    }}
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Canvas */}
      <div
        className="w-full relative"
        style={{ height: totalPages > 1 ? height - 36 : height }}
      >
        <Bar key={themeKey} data={chartData} options={options} plugins={[ChartDataLabels]} />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-3">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded-md hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {currentPage + 1} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
            className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground bg-muted border border-border rounded-md hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
