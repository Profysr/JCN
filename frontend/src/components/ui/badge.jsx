import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        default:     "bg-primary/10 text-primary border border-primary/20",
        secondary:   "bg-secondary text-secondary-foreground border border-border",
        success:     "bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
        warning:     "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
        destructive: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
        muted:       "bg-muted text-muted-foreground border border-border",
        outline:     "border border-current bg-transparent",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px] leading-none",
        md: "px-2 py-0.5 text-xs",
        lg: "px-2.5 py-1 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  }
);

export function Badge({ className, variant, size, dot, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full flex-shrink-0",
            variant === "success"     && "bg-emerald-500 dark:bg-emerald-400",
            variant === "warning"     && "bg-amber-500 dark:bg-amber-400",
            variant === "destructive" && "bg-red-500 dark:bg-red-400",
            (!variant || variant === "default") && "bg-primary",
            variant === "muted"       && "bg-muted-foreground",
          )}
        />
      )}
      {children}
    </span>
  );
}
