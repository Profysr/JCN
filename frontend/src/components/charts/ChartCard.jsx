import { cn } from "@/lib/utils";

/**
 * Wrapper card used by every chart — consistent padding, header, loading/empty states.
 */
export default function ChartCard({ title, subtitle, actions, children, className, loading, empty, emptyText = "No data yet" }) {
  return (
    <div className={cn("bg-card border border-border rounded-xl shadow-card flex flex-col", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between px-5 pt-4 pb-2 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </div>
      )}

      <div className="flex-1 min-h-0 px-5 pb-4">
        {loading ? (
          <div className="h-40 flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : empty ? (
          <div className="h-40 flex flex-col items-center justify-center text-center gap-2">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg">📊</div>
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
