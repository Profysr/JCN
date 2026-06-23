import { Tooltip } from "@/shared/components/ui/tooltip";

/**
 * Tooltip that shows a label with an optional keyboard shortcut badge.
 * Usage:
 *   <ShortcutTooltip label="Collapse sidebar" shortcut="Ctrl+.">
 *     <button .../>
 *   </ShortcutTooltip>
 */
export function ShortcutTooltip({
  children,
  label,
  shortcut,
  side = "right",
  align = "center",
  delayDuration = 300,
}) {
  const content = shortcut ? (
    <span className="flex items-center gap-2">
      {label}
      <kbd className="text-[10px] font-mono bg-background/20 border border-white/20 rounded px-1 py-0.5 leading-none">
        {shortcut}
      </kbd>
    </span>
  ) : (
    label
  );

  return (
    <Tooltip content={content} side={side} align={align} delayDuration={delayDuration}>
      {children}
    </Tooltip>
  );
}
