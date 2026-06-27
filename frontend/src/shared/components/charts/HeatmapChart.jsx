import { cn } from '@/shared/lib/utils';

// 5-stop intensity scale: 0 = empty, 4 = hottest
const INTENSITY_BG = [
  'bg-transparent',
  'bg-primary/10',
  'bg-primary/30',
  'bg-primary/55',
  'bg-primary',
];
const INTENSITY_TEXT = [
  'text-muted-foreground/40',
  'text-muted-foreground',
  'text-foreground',
  'text-foreground',
  'text-primary-foreground',
];

function intensityLevel(value, max) {
  if (!value || max === 0) return 0;
  const ratio = value / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

/**
 * Table-based heatmap — pure CSS, no canvas.
 *
 * Covers: workload heatmap (members × days), any member/time matrix.
 *
 * Props:
 *   rows         [{ label: string, values: number[] }]
 *   columns      string[]                       — column header labels
 *   cellTitle?   (value, rowLabel, colLabel) => string   — hover title
 *   cellLabel?   (value) => string              — override cell text (default: raw value)
 *   showTotal?   boolean                        — append a Total column (default true)
 */
export default function HeatmapChart({
  rows = [],
  columns = [],
  cellTitle,
  cellLabel,
  showTotal = true,
}) {
  if (!rows.length || !columns.length) return null;

  const globalMax = Math.max(...rows.flatMap((r) => r.values), 1);

  return (
    <div className="w-full rounded-lg border border-border flex flex-col">
      <div className="overflow-x-auto flex-1">
      <table className="min-w-full text-xs border-collapse">
        {/* Header */}
        <thead>
          <tr className="bg-muted">
            <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left text-[11px] font-bold text-muted-foreground whitespace-nowrap min-w-[7rem]">
              Member
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="px-1.5 py-2 text-center text-[10px] font-semibold text-muted-foreground whitespace-nowrap min-w-[2.5rem]"
              >
                {col}
              </th>
            ))}
            {showTotal && (
              <th className="px-2 py-2 text-center text-[10px] font-bold text-muted-foreground whitespace-nowrap min-w-[3rem]">
                Total
              </th>
            )}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const total = row.values.reduce((s, v) => s + (v || 0), 0);
            return (
              <tr key={row.label} className="group hover:bg-muted/20 transition-colors">
                {/* Row label */}
                <td className="sticky left-0 z-10 bg-card group-hover:bg-muted/30 px-3 py-1.5 font-medium text-foreground whitespace-nowrap text-[12px] transition-colors">
                  {row.label}
                </td>

                {/* Cells */}
                {row.values.map((value, ci) => {
                  const level = intensityLevel(value, globalMax);
                  const title = cellTitle
                    ? cellTitle(value, row.label, columns[ci])
                    : value > 0 ? `${row.label} — ${columns[ci]}: ${value}` : undefined;
                  const display = cellLabel ? cellLabel(value) : value || '';

                  return (
                    <td
                      key={ci}
                      title={title}
                      className={cn(
                        'px-1 py-1.5 text-center font-semibold tabular-nums transition-all duration-150',
                        INTENSITY_BG[level],
                        INTENSITY_TEXT[level],
                      )}
                    >
                      <span className="text-[11px]">{display}</span>
                    </td>
                  );
                })}

                {/* Total */}
                {showTotal && (
                  <td className="px-2 py-1.5 text-center font-bold text-foreground text-[11px] tabular-nums border-l border-border">
                    {total}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {/* Intensity legend — outside the scroll container so it never drifts horizontally */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30 flex-shrink-0">
        <span className="text-[10px] font-semibold text-muted-foreground mr-1">Intensity:</span>
        {['None', 'Low', 'Med', 'High', 'Peak'].map((lbl, i) => (
          <div key={lbl} className="flex items-center gap-1">
            <span
              className={cn(
                'w-4 h-4 rounded-sm border border-border text-[9px] flex items-center justify-center font-bold',
                INTENSITY_BG[i],
                INTENSITY_TEXT[i],
              )}
            >
              {i === 0 ? '0' : ''}
            </span>
            <span className="text-[10px] text-muted-foreground">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
