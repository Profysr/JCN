import { forwardRef } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground border border-primary shadow-[0_1px_2px_rgba(0,0,0,0.15)] ring-1 ring-inset ring-white/15 enabled:hover:brightness-110 enabled:active:brightness-95 enabled:active:scale-[0.97] enabled:active:translate-y-px enabled:active:shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground border border-destructive shadow-[0_1px_2px_rgba(0,0,0,0.15)] ring-1 ring-inset ring-white/15 enabled:hover:brightness-110 enabled:active:brightness-95 enabled:active:scale-[0.97] enabled:active:translate-y-px enabled:active:shadow-none",
        outline:
          "border border-input bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06)] enabled:hover:border-primary/40 enabled:hover:bg-accent enabled:hover:text-accent-foreground enabled:hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] enabled:active:scale-[0.97]",
        secondary:
          "bg-secondary text-secondary-foreground border border-border shadow-[0_1px_2px_rgba(0,0,0,0.06)] enabled:hover:bg-background enabled:hover:border-primary/40 enabled:hover:text-foreground enabled:hover:shadow-[0_1px_3px_rgba(0,0,0,0.1)] enabled:active:scale-[0.97]",
        ghost:
          "bg-transparent text-muted-foreground border border-transparent enabled:hover:bg-primary/5 enabled:hover:border-primary/10 enabled:hover:text-primary enabled:hover:shadow-sm enabled:active:scale-[0.97]",
        link: "text-primary underline-offset-4 enabled:hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs font-semibold tracking-wide uppercase",
        lg: "h-10 px-8 font-semibold tracking-tight",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

const Button = forwardRef(({ className, variant, size, ...props }, ref) => (
  <button
    className={cn(buttonVariants({ variant, size, className }))}
    ref={ref}
    {...props}
  />
));
Button.displayName = "Button";

export { Button };
