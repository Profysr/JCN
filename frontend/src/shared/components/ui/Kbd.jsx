import { cn } from "@/shared/lib/utils";
import { getShortcutDisplay } from "@/shared/lib/shortcutsRegistry";

/**
 * A single keyboard-shortcut badge. Pass a raw string (e.g. "⇧ T") as children.
 */
export function Kbd({ children, className }) {
  return (
    <kbd
      className={cn(
        "font-mono normal-case tracking-normal bg-muted/70 border border-border/60 rounded px-1 py-px leading-none text-[10px] text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Renders the kbd badge for a registry shortcut id. Returns null when the id
 * is unknown, so callers can drop it in unconditionally.
 *
 *   <ShortcutKbd id="task:status" />  →  <kbd>⇧ S</kbd>
 */
export function ShortcutKbd({ id, className }) {
  const display = getShortcutDisplay(id);
  if (!display) return null;
  return <Kbd className={className}>{display}</Kbd>;
}

/**
 * Inline hint shown at the bottom of an editable section, e.g.
 *   Press ⇧E to edit the description
 *
 * @param {string}  id     registry shortcut id
 * @param {string}  label  trailing verb phrase ("edit the description")
 */
export function ShortcutHint({ id, label, className }) {
  const display = getShortcutDisplay(id);
  if (!display) return null;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-[10px] text-muted-foreground/50 select-none",
        className,
      )}
    >
      <span>Press</span>
      <Kbd className="text-muted-foreground/60">{display}</Kbd>
      <span>to {label}</span>
    </p>
  );
}

/**
 * Tooltip content that pairs a text label with its shortcut badge — for use
 * as the `content` prop of <Tooltip>. Keeps hover hints out of the layout.
 */
export function TooltipLabel({ label, id }) {
  const display = getShortcutDisplay(id);
  return (
    <span className="flex items-center gap-1.5">
      {label}
      {display && (
        <kbd className="font-mono text-[10px] leading-none bg-background/20 border border-background/30 rounded px-1 py-px">
          {display}
        </kbd>
      )}
    </span>
  );
}
