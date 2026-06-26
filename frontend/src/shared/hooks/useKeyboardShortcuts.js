import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * Returns true when the keyboard event originates from an interactive element.
 * We suppress shortcuts in those cases so typing still works normally.
 */
function isTypingTarget(e) {
  const tag = e.target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    e.target.isContentEditable
  );
}

/**
 * Registers all global keyboard shortcuts.
 *
 * @param {object} opts
 * @param {() => void} opts.onOpenPalette   — open ⌘K command palette
 * @param {() => void} opts.onOpenShortcuts — open ? shortcut overlay
 * @param {() => void} opts.onCreateTask    — trigger "create task" (context-aware)
 */

/**
 * Adding a new shortcut - Say you want Shift+N to open notifications.
 * Step 1 — Register it in the registry (shortcutsRegistry.js:56):
  { keys: ["Shift+N"], display: ["⇧", "N"], description: "Open notifications" }
  This makes it appear in the ? overlay automatically.

 * Step 2 — Handle it in the hook (useKeyboardShortcuts.js:27):
  Add the param and the case in the switch (or before it for modifier combos):

  export function useKeyboardShortcuts({ ..., onOpenNotifications } = {}) {
    // inside the handler:
    if (e.shiftKey && e.key === "N") {
      e.preventDefault();
      onOpenNotifications?.();
      return;
    }
 * Step 3 — Wire the callback in AppLayout (AppLayout.jsx:92):
  useKeyboardShortcuts({
    ...existing,
    onOpenNotifications: () => setNotificationsOpen(true),
}); 
 */

export function useKeyboardShortcuts({
  onOpenPalette,
  onOpenShortcuts,
  onToggleSidebar,
  onCreateTask,
  onOpenPermissions,
  onOpenFilters,
  onFocusSearch,
} = {}) {
  const navigate = useNavigate();
  const { workspaceId } = useParams();

  // Tracks the first key of a chord (e.g. "g" in "g p")
  const chordRef = useRef(null);
  const chordTimer = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = (path) => `/w/${workspaceId}/${path}`;
    const CHORD_MAP = {
      b: () => navigate(ws("boards")),
      d: () => navigate(ws("dashboards")),
      w: () => navigate(ws("my-work")),
      i: () =>
        window.dispatchEvent(new CustomEvent("jcn:toggle-notifications")),
      a: () => navigate(ws("analytics")),
      g: () => navigate(ws("goals")),
      s: () => navigate(ws("settings")),
      m: () => navigate(ws("members")),
    };

    const handler = (e) => {
      // Never swallow modifier-key combos (Ctrl/Meta/Alt) except ⌘ K
      const isModified = e.ctrlKey || e.metaKey || e.altKey;

      // ⌘ K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenPalette?.();
        return;
      }

      // ⌘. / Ctrl+. — toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      if (isTypingTarget(e) || isModified) return;

      // Shift+F — open/close filter panel
      if (e.shiftKey && e.key === "F") {
        e.preventDefault();
        onOpenFilters?.();
        return;
      }

      // Chord: pending "g ..."
      if (chordRef.current === "g") {
        clearTimeout(chordTimer.current);
        chordRef.current = null;
        const action = CHORD_MAP[e.key.toLowerCase()];
        if (action) {
          e.preventDefault();
          action();
        }
        return;
      }

      switch (e.key) {
        case "g":
          // Start "g X" chord — wait up to 1.5 s for the second key
          e.preventDefault();
          chordRef.current = "g";
          chordTimer.current = setTimeout(() => {
            chordRef.current = null;
          }, 1500);
          break;

        case "?":
          e.preventDefault();
          onOpenShortcuts?.();
          break;

        case "c":
          e.preventDefault();
          onCreateTask?.();
          break;

        case "r":
          e.preventDefault();
          onOpenPermissions?.();
          break;

        case "/":
          e.preventDefault();
          onFocusSearch?.();
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(chordTimer.current);
    };
  }, [
    workspaceId,
    navigate,
    onOpenPalette,
    onOpenShortcuts,
    onCreateTask,
    onToggleSidebar,
    onOpenFilters,
    onFocusSearch,
  ]);
}
