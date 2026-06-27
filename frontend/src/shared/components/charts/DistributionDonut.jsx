import { useMemo, useState, useRef, useEffect } from 'react';
import { Doughnut } from 'react-chartjs-2';
import './chartSetup';
import { chartColors } from './chartTheme';
import { getChartColor } from './chartPalette';

// Draws label + value in the donut hole; syncs with hover state.
const centerTextPlugin = {
  id: 'donutCenterText',
  beforeDraw(chart) {
    const opts = chart.config.options?.plugins?.centerText;
    if (!opts) return;
    const { width, height, ctx } = chart;
    const { hoveredIndex, slices, total, foreground, mutedFg } = opts;
    ctx.save();

    let label = 'Total';
    let labelColor = mutedFg || '#94a3b8';
    let value = total;

    if (hoveredIndex !== null && slices[hoveredIndex]) {
      label = slices[hoveredIndex].name;
      labelColor = slices[hoveredIndex].color;
      value = slices[hoveredIndex].value;
    }

    const cx = width / 2;
    const cy = height / 2;
    const displayValue =
      value >= 1_000_000
        ? `${(value / 1_000_000).toFixed(1)}M`
        : value >= 1000
        ? `${(value / 1000).toFixed(1)}k`
        : String(value);

    const maxChars = 13;
    const truncated = label.length > maxChars ? label.slice(0, maxChars) + '…' : label;

    ctx.font = `600 11px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = labelColor;
    ctx.fillText(truncated, cx, cy - 15);

    ctx.font = `800 28px ui-sans-serif, system-ui, sans-serif`;
    ctx.fillStyle = foreground || '#0f172a';
    ctx.fillText(displayValue, cx, cy + 13);
    ctx.restore();
  },
};

// ── Data helper ───────────────────────────────────────────────────────────────

export function toDonutData(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const entries = Object.entries(raw)
    .map(([name, v]) => [
      name,
      typeof v === 'number' ? v : (v?.count ?? v?.total ?? 0),
    ])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return {
    total,
    slices: entries.map(([name, value], i) => ({
      name,
      value,
      color: getChartColor(i),
    })),
  };
}

// ── Donut canvas ──────────────────────────────────────────────────────────────

function BaseDonut({ data, hoveredIndex, onHover, onSliceClick, height }) {
  const chartRef = useRef(null);
  const c = chartColors();
  const { slices, total } = data;

  const chartData = useMemo(
    () => ({
      labels: slices.map((s) => s.name),
      datasets: [
        {
          data: slices.map((s) => s.value),
          backgroundColor: slices.map((s) => s.color),
          hoverBackgroundColor: slices.map((s) => s.color),
          borderWidth: 3,
          borderColor: c.card,
          hoverBorderColor: c.card,
          hoverBorderWidth: 3,
          hoverOffset: 10,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slices, c.card],
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      layout: { padding: 6 },
      animation: {
        animateScale: true,
        animateRotate: true,
        duration: 900,
        easing: 'easeOutQuart',
      },
      onHover: (evt, elements) => {
        const idx = elements.length > 0 ? elements[0].index : null;
        if (idx !== hoveredIndex) onHover?.(idx);
        if (onSliceClick && evt?.native?.target) {
          evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        }
      },
      onClick: onSliceClick
        ? (_evt, elements) => {
            if (elements.length) onSliceClick(slices[elements[0].index]);
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
          callbacks: {
            labelColor: (ctx) => ({
              borderColor: ctx.element.options.backgroundColor,
              backgroundColor: ctx.element.options.backgroundColor,
              borderWidth: 2,
              borderRadius: 3,
            }),
            label: (ctx) => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${ctx.parsed.toLocaleString()} (${pct}%)`;
            },
          },
        },
        centerText: {
          hoveredIndex,
          slices,
          total,
          foreground: c.foreground,
          mutedFg: c.mutedForeground,
        },
      },
    }),
    [hoveredIndex, slices, total, c, onSliceClick],
  );

  // Sync external hover → Chart.js active element
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (hoveredIndex !== null) {
      chart.setActiveElements([{ datasetIndex: 0, index: hoveredIndex }]);
    } else {
      chart.setActiveElements([]);
    }
    chart.update('none');
  }, [hoveredIndex]);

  return (
    <div className="w-full relative" style={{ height }}>
      <Doughnut ref={chartRef} data={chartData} options={options} plugins={[centerTextPlugin]} />
    </div>
  );
}

// ── Compact legend (2-col grid below the donut) ───────────────────────────────

function CompactLegend({ slices, total, hoveredIdx, onHover }) {
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-3 px-1">
      {slices.map((slice, i) => {
        const pct = total > 0 ? ((slice.value / total) * 100).toFixed(0) : '0';
        const isHovered = hoveredIdx === i;
        return (
          <div
            key={i}
            onMouseEnter={() => onHover?.(i)}
            onMouseLeave={() => onHover?.(null)}
            className={`flex items-center gap-1.5 cursor-pointer rounded-md px-1.5 py-1 transition-all duration-150 ${
              isHovered ? 'bg-primary/5' : 'hover:bg-muted/60'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-150 ${
                isHovered ? 'scale-125' : ''
              }`}
              style={{ backgroundColor: slice.color }}
            />
            <span
              className={`text-[11px] truncate flex-1 min-w-0 transition-colors duration-150 ${
                isHovered ? 'text-foreground font-semibold' : 'text-muted-foreground'
              }`}
            >
              {slice.name}
            </span>
            <span
              className="text-[11px] font-bold tabular-nums shrink-0 transition-colors duration-150"
              style={{ color: isHovered ? slice.color : undefined }}
            >
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Full side-panel legend ────────────────────────────────────────────────────

function SideLegend({ slices, total, hoveredIdx, onHover, height }) {
  const maxVal = Math.max(...slices.map((s) => s.value), 1);
  return (
    <div
      className="w-full lg:w-72 lg:shrink-0 flex flex-col border border-border rounded-xl overflow-hidden"
      style={{ maxHeight: height }}
    >
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between flex-shrink-0">
        <p className="text-[10px] font-black tracking-widest uppercase text-muted-foreground">
          Distribution
        </p>
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums">
          {total.toLocaleString()}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 divide-y divide-border">
        {slices.map((slice, i) => {
          const isHovered = hoveredIdx === i;
          const pct = total ? ((slice.value / total) * 100).toFixed(1) : '0.0';
          const barWidth = ((slice.value / maxVal) * 100).toFixed(1);

          return (
            <div
              key={i}
              onMouseEnter={() => onHover?.(i)}
              onMouseLeave={() => onHover?.(null)}
              className={`px-3 py-2.5 transition-all duration-150 cursor-pointer ${
                isHovered ? 'bg-primary/5' : 'hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 transition-transform duration-200 ${
                      isHovered ? 'scale-125' : ''
                    }`}
                    style={{ backgroundColor: slice.color }}
                  />
                  <span
                    className={`text-[12px] truncate transition-colors duration-150 ${
                      isHovered
                        ? 'text-foreground font-semibold'
                        : 'text-muted-foreground font-medium'
                    }`}
                  >
                    {slice.name}
                  </span>
                </div>
                <span
                  className={`text-[12px] font-bold tabular-nums shrink-0 transition-colors duration-150 ${
                    isHovered ? '' : 'text-foreground'
                  }`}
                  style={{ color: isHovered ? slice.color : undefined }}
                >
                  {slice.value.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: slice.color,
                      opacity: isHovered ? 1 : 0.55,
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground w-8 text-right shrink-0">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

/**
 * Donut chart with an interactive legend.
 *
 * Props:
 *   data        { total: number, slices: [{ name, value, color }] } | null
 *   height?     number   — canvas height (default 300)
 *   compact?    boolean  — compact 2-col legend below donut (default false → side panel)
 *   showLegend? boolean  — whether to show any legend (default true)
 */
export default function DistributionDonut({
  data,
  height = 300,
  compact = false,
  showLegend = true,
  onSliceClick,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data) {
    return (
      <div className="w-full bg-muted/30 animate-pulse rounded-xl" style={{ height }} />
    );
  }

  const { slices, total } = data;

  if (compact) {
    return (
      <div className="flex flex-col w-full">
        <BaseDonut
          data={data}
          height={height}
          hoveredIndex={hoveredIdx}
          onHover={setHoveredIdx}
          onSliceClick={onSliceClick}
        />
        {showLegend && (
          <CompactLegend
            slices={slices}
            total={total}
            hoveredIdx={hoveredIdx}
            onHover={setHoveredIdx}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col lg:flex-row gap-4 items-start w-full ${
        !showLegend ? 'justify-center' : ''
      }`}
    >
      <div
        className={`${
          showLegend ? 'flex-1' : 'w-full flex justify-center'
        } flex flex-col items-center`}
      >
        <BaseDonut
          data={data}
          height={height}
          hoveredIndex={hoveredIdx}
          onHover={setHoveredIdx}
          onSliceClick={onSliceClick}
        />
      </div>

      {showLegend && (
        <SideLegend
          slices={slices}
          total={total}
          hoveredIdx={hoveredIdx}
          onHover={setHoveredIdx}
          height={height}
        />
      )}
    </div>
  );
}
