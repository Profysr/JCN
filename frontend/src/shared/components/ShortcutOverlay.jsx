import { Keyboard } from "lucide-react";
import { visibleShortcutGroups } from "@/shared/lib/shortcutsRegistry";
import { usePermission } from "@/contexts/PermissionsContext";
import { cn } from "@/shared/lib/utils";
import Modal from "@/shared/components/ui/Modal";

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
      <span className="text-sm text-muted-foreground">
        {shortcut.description}
      </span>
      <div className="flex items-center gap-1 flex-shrink-0">
        {shortcut.display.map((k, i) => (
          <Key key={i} label={k} />
        ))}
      </div>
    </div>
  );
}

export default function ShortcutOverlay({ onClose }) {
  const { can, isOwner, hasAppAccess } = usePermission();
  const groups = visibleShortcutGroups(
    (app) => isOwner || hasAppAccess(app),
    (perm) => isOwner || can(perm),
  );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Keyboard Shortcuts"
      icon={Keyboard}
      iconColor="text-primary"
      showFooter={false}
      maxWidth="900px"
      padding="p-5"
    >
      <div
        data-tour="shortcuts_overlay"
        className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6"
      >
        {groups.map((group) => (
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
      <p className="mt-6 text-center text-xs text-muted-foreground/60">
        Press <Key label="?" /> anywhere to toggle this overlay ·{" "}
        <Key label="Esc" /> to close
      </p>
    </Modal>
  );
}
