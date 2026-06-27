import { useState } from "react";
import { cn } from "@/shared/lib/utils";
import { BarChart2, Maximize2 } from "lucide-react";
import Modal from "@/shared/components/ui/Modal";

// ── Skeleton shapes ───────────────────────────────────────────────────────────

function BarChartSkeleton({ height }) {
  const barHeights = [58, 84, 42, 72, 91, 54, 78, 46];
  return (
    <div className="flex items-end gap-2 px-1 pb-5 pt-3" style={{ height }}>
      <div className="flex flex-col justify-between w-6 flex-shrink-0 pr-1" style={{ height: "calc(100% - 1.25rem)" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2 w-5 bg-muted animate-pulse rounded" />
        ))}
      </div>
      <div className="flex-1 flex items-end gap-1.5" style={{ height: "calc(100% - 1.25rem)" }}>
        {barHeights.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-muted animate-pulse rounded-t-sm"
            style={{ height: `${h}%`, animationDelay: `${i * 55}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function LineChartSkeleton({ height }) {
  return (
    <div style={{ height }} className="px-2 py-3">
      <svg viewBox="0 0 400 100" className="w-full h-full" preserveAspectRatio="none">
        {[20, 45, 70].map((y) => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="hsl(var(--border))" strokeWidth="0.8" />
        ))}
        <path
          d="M 0,72 C 35,66 55,30 100,46 C 148,62 172,16 225,27 C 278,38 308,57 358,44 L 400,28"
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.22)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse"
        />
        <path
          d="M 0,72 C 35,66 55,30 100,46 C 148,62 172,16 225,27 C 278,38 308,57 358,44 L 400,28 L 400,100 L 0,100 Z"
          fill="hsl(var(--muted-foreground) / 0.06)"
          className="animate-pulse"
        />
      </svg>
    </div>
  );
}

function ScatterChartSkeleton({ height }) {
  const dots = [
    [12, 72], [24, 40], [36, 82], [48, 26], [60, 60],
    [70, 44], [80, 76], [90, 18], [28, 56], [72, 34],
    [52, 88], [18, 20], [82, 64], [44, 52], [64, 38], [56, 70],
  ];
  return (
    <div style={{ height }} className="px-2 py-3">
      <svg viewBox="0 0 100 100" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {[25, 50, 75].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="hsl(var(--border))" strokeWidth="0.4" />
        ))}
        {dots.map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="2.6"
            fill="hsl(var(--muted-foreground) / 0.18)"
            className="animate-pulse"
            style={{ animationDelay: `${i * 48}ms` }}
          />
        ))}
      </svg>
    </div>
  );
}

function HeatmapSkeleton({ height }) {
  const rows = 4;
  const cols = 9;
  return (
    <div style={{ height }} className="px-1 py-2 overflow-hidden">
      <div className="flex gap-1.5 mb-2 items-center">
        <div className="w-20 h-3" />
        {Array.from({ length: cols }, (_, c) => (
          <div key={c} className="w-8 h-2.5 bg-muted animate-pulse rounded" style={{ opacity: 0.45 }} />
        ))}
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-1.5 items-center">
            <div className="w-20 h-5 bg-muted animate-pulse rounded" style={{ animationDelay: `${r * 70}ms` }} />
            {Array.from({ length: cols }, (_, c) => (
              <div
                key={c}
                className="w-8 h-7 bg-muted animate-pulse rounded"
                style={{
                  opacity: 0.18 + ((r * cols + c) % 6) * 0.1,
                  animationDelay: `${(r * cols + c) * 22}ms`,
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TableSkeleton({ height }) {
  const colFlex = [2.5, 1, 1, 0.8];
  return (
    <div style={{ height }} className="px-1 py-2 overflow-hidden">
      <div className="flex gap-3 pb-2 border-b border-border mb-0.5">
        {colFlex.map((f, i) => (
          <div key={i} className="h-2.5 bg-muted animate-pulse rounded" style={{ flex: f, opacity: 0.55 }} />
        ))}
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-3 items-center py-2.5 border-b border-border last:border-0">
          {colFlex.map((f, j) => (
            <div
              key={j}
              className="h-3 bg-muted animate-pulse rounded"
              style={{ flex: f, opacity: 0.28 + i * 0.04, animationDelay: `${i * 55}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function DonutSkeleton({ height }) {
  return (
    <div style={{ height }} className="flex items-center justify-center gap-6 px-2 py-3">
      {/* Donut ring */}
      <div className="relative flex-shrink-0" style={{ width: height * 0.7, height: height * 0.7 }}>
        <svg viewBox="0 0 100 100" className="w-full h-full animate-pulse">
          <circle cx="50" cy="50" r="38" fill="none" stroke="hsl(var(--muted))" strokeWidth="16" />
          <circle
            cx="50" cy="50" r="38"
            fill="none"
            stroke="hsl(var(--muted-foreground) / 0.15)"
            strokeWidth="16"
            strokeDasharray="80 160"
            strokeLinecap="round"
            style={{ animationDelay: '120ms' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-3 bg-muted animate-pulse rounded" />
        </div>
      </div>
      {/* Legend rows */}
      <div className="flex flex-col gap-2 flex-1 max-w-[140px]">
        {[80, 60, 50, 70, 45].map((w, i) => (
          <div key={i} className="flex items-center gap-2" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="w-2 h-2 rounded-full bg-muted animate-pulse flex-shrink-0" />
            <div className="h-2.5 bg-muted animate-pulse rounded" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const SKELETONS = {
  bar: BarChartSkeleton,
  line: LineChartSkeleton,
  scatter: ScatterChartSkeleton,
  heatmap: HeatmapSkeleton,
  table: TableSkeleton,
  donut: DonutSkeleton,
};

// ── ChartCard ─────────────────────────────────────────────────────────────────

export default function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  loading,
  empty,
  emptyText = "No data yet",
  skeletonType = "bar",
  skeletonHeight = 240,
  allowExpand = false,
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const SkeletonEl = SKELETONS[skeletonType] ?? BarChartSkeleton;

  const content = loading ? (
    <SkeletonEl height={skeletonHeight} />
  ) : empty ? (
    <div
      className="flex flex-col items-center justify-center text-center gap-2"
      style={{ height: skeletonHeight }}
    >
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <BarChart2 className="w-5 h-5" />
      </div>
      <p className="text-sm text-muted-foreground">{emptyText}</p>
    </div>
  ) : (
    children
  );

  return (
    <>
      <div className={cn("bg-card border border-border rounded-xl shadow-sm flex flex-col", className)}>
        {(title || actions || allowExpand) && (
          <div className="flex items-start justify-between px-5 pt-4 pb-2 flex-shrink-0">
            <div>
              <p className="text-sm font-semibold">{title}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {actions && <div className="flex items-center gap-1.5">{actions}</div>}
              {allowExpand && (
                <button
                  onClick={() => setIsExpanded(true)}
                  title="Expand"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Maximize2 size={14} />
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 px-5 pb-4">
          {content}
        </div>
      </div>

      {allowExpand && isExpanded && (
        <Modal
          isOpen={isExpanded}
          onClose={() => setIsExpanded(false)}
          title={title}
          description={subtitle}
          showFooter={false}
          maxWidth="900px"
        >
          <div className="p-4">
            {!loading && !empty && children}
          </div>
        </Modal>
      )}
    </>
  );
}
