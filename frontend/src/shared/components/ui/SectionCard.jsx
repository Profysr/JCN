import { cn } from "@/shared/lib/utils";

export function SectionCard({ title, icon: Icon, children, className, action }) {
  return (
    <div className={cn("rounded-md border border-border bg-card shadow-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground flex-1">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function DetailRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border/40 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  );
}

export function Chip({ label, color, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium",
        className,
      )}
      style={color ? { backgroundColor: `${color}18`, color } : undefined}
    >
      {label}
    </span>
  );
}
