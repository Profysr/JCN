import { useEffect } from "react";
import { X, Keyboard } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/shortcutsRegistry";
import { cn } from "@/lib/utils";

/** A single styled <kbd> key badge. */
function Key({ label }) {
  const wide = label === "Space" || label === "Enter" || label === "Esc";
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-md border border-border bg-muted",
        "text-[11px] font-semibold text-foreground leading-none shadow-sm",
        "min-w-[22px] h-[22px] px-1.5",
        wide && "px-2.5",
      )}
    >
      {label}
    </kbd>
  );
}

/** A row in the shortcut table: keys + description. */
function ShortcutRow({ shortcut }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {shortcut.display.map((k, i) => (
          <Key key={i} label={k} />
        ))}
      </div>
    </div>
  );
}

export default function ShortcutOverlay({ onClose }) {
  // Close on Esc
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-primary" />
            <h2 className="font-bold text-base">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — two-column grid of groups */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.id}>
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                  {group.label}
                </h3>
                <div className="divide-y divide-border/50">
                  {group.shortcuts.map((shortcut, i) => (
                    <ShortcutRow key={i} shortcut={shortcut} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <p className="mt-6 text-center text-xs text-muted-foreground/60">
            Press <Key label="?" /> anywhere to toggle this overlay · <Key label="Esc" /> to close
          </p>
        </div>
      </div>
    </div>
  );
}
