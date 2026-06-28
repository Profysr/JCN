import { useMemo, useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import './chartSetup';
import { chartColors } from './chartTheme';
import { getChartColor } from './chartPalette';

const TICK_TRUNCATE = 12;

/**
 * Generic paginated stacked bar chart.
 *
 * Props:
 *   series        [{ name, data, color? }]   — each series is one stack layer
 *   categories    string[]                   — x-axis labels (one per bar)
 *   yTitle?       string                     — y-axis label
 *   height?       number                     — canvas height in px (default 300)
 *   horizontal?   boolean                    — swap axes
 *   barsPerPage?  number                     — pagination window (default 15)
 */
export default function StackedBarChart({
  series = [],
  categories = [],
  yTitle,
  height = 300,
  horizontal = false,
  barsPerPage = 15,
}) {
  const [hiddenSeries, setHiddenSeries] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const c = chartColors();

  const totals = useMemo(
    () =>
      categories.map((_, idx) =>
        series.reduce((sum, s) => sum + (s.data?.[idx] ?? 0), 0),
      ),
    [series, categories],
  );

  const catLen = categories.length;
  const totalPages = Math.max(1, Math.ceil(catLen / barsPerPage));
  const endIndex = catLen - (totalPages - 1 - currentPage) * barsPerPage;
  const startIndex = Math.max(0, endIndex - barsPerPage);

  const paginatedCategories = useMemo(
    () => categories.slice(startIndex, endIndex),
    [categories, startIndex, endIndex],
  );
  const paginatedTotals = useMemo(
    () => totals.slice(startIndex, endIndex),
    [totals, startIndex, endIndex],
  );

  // Jump to last page whenever data changes
  useEffect(() => {
    setCurrentPage(Math.max(0, Math.ceil(catLen / barsPerPage) - 1));
  }, [catLen, barsPerPage]);

  const chartData = useMemo(() => {
    const datasets = series.map((s, i) => ({
      type: 'bar',
      label: s.name,
      data: s.data?.slice(startIndex, endIndex) ?? [],
      backgroundColor: s.color || getChartColor(i),
      hidden: hiddenSeries.has(s.name),
      stack: 'combined',
      borderRadius: 0,
      borderSkipped: 'start',
      yAxisID: 'y',
      datalabels: {
        display(context) {
          const ds = context.chart.data.datasets;
          const visible = ds
            .map((d, idx) => ({ hidden: d.hidden, idx }))
            .filter((d) => !d.hidden);
          const lastIdx = visible[visible.length - 1]?.idx;
          return context.datasetIndex === lastIdx;
        },
        align: horizontal ? 'right' : 'end',
        anchor: 'end',
        offset: 2,
        font: { size: 11, weight: 'bold' },
        color: c.foreground,
        formatter(_, context) {
          const total = paginatedTotals[context.dataIndex];
          return total > 0 ? total : '';
        },
      },
    }));
    return { labels: paginatedCategories, datasets };
  }, [series, paginatedTotals, paginatedCategories, startIndex, endIndex, horizontal, hiddenSeries, c.foreground]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      elements: { bar: { borderColor: 'transparent', borderWidth: 0 } },
      plugins: {
        legend: { display: false },
        datalabels: { display: false }, // per-dataset overrides selectively enable it
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
          stacked: true,
          grid: { display: horizontal, color: c.grid, drawBorder: false },
          ticks: {
            font: { size: 10 },
            color: c.mutedForeground,
            maxRotation: paginatedCategories.length > 8 ? 90 : 0,
            minRotation: paginatedCategories.length > 8 ? 90 : 0,
            autoSkip: false,
            callback(value) {
              const label = this.getLabelForValue(value);
              return typeof label === 'string' && label.length > TICK_TRUNCATE
                ? label.slice(0, TICK_TRUNCATE) + '…'
                : label;
            },
          },
          border: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            display: !horizontal,
            color: c.grid,
            borderDash: [4, 4],
            drawBorder: false,
          },
          ticks: {
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
      layout: { padding: { top: 24 } },
    }),
    [horizontal, yTitle, paginatedCategories.length, c],
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
      {/* Toggleable legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
        {series.map((s, i) => {
          const isHidden = hiddenSeries.has(s.name);
          const color = s.color || getChartColor(i);
          return (
            <button
              key={s.name}
              onClick={() => toggleSeries(s.name)}
              className={`flex items-center gap-1.5 transition-all duration-200 ${
                isHidden ? 'opacity-35 grayscale' : 'opacity-100 hover:opacity-70'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                {s.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div
        className="w-full relative"
        style={{ height: totalPages > 1 ? height - 36 : height }}
      >
        <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
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
