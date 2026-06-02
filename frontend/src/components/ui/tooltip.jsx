import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  delayDuration = 300,
  className,
  ...props
}) {
  if (!content) return children;

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-[400] px-2.5 py-1.5 text-xs font-medium leading-none",
            "bg-foreground text-background rounded-md shadow-md",
            "animate-scale-in",
            "select-none",
            className
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-foreground" width={8} height={4} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
