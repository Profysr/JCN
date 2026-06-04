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
 * @param {() => void} opts.onOpenFilter    — focus the filter/search bar
 */
export function useKeyboardShortcuts({
  onOpenPalette,
  onOpenShortcuts,
  onCreateTask,
  onOpenFilter,
} = {}) {
  const navigate        = useNavigate();
  const { workspaceSlug } = useParams();

  // Tracks the first key of a chord (e.g. "g" in "g p")
  const chordRef   = useRef(null);
  const chordTimer = useRef(null);

  useEffect(() => {
    if (!workspaceSlug) return;

    const ws = (path) => `/w/${workspaceSlug}/${path}`;

    const CHORD_MAP = {
      p: () => navigate(ws("projects")),
      d: () => navigate(ws("dashboards")),
      m: () => navigate(ws("my-work")),
      i: () => navigate(ws("inbox")),
      a: () => navigate(ws("dashboards?tab=analytics")),
      g: () => navigate(ws("goals")),
    };

    const handler = (e) => {
      // Never swallow modifier-key combos (Ctrl/Meta/Alt) except ⌘K
      const isModified = e.ctrlKey || e.metaKey || e.altKey;

      // ⌘K / Ctrl+K — command palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenPalette?.();
        return;
      }

      if (isTypingTarget(e) || isModified) return;

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

        case "/":
          e.preventDefault();
          onOpenFilter?.();
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
  }, [workspaceSlug, navigate, onOpenPalette, onOpenShortcuts, onCreateTask, onOpenFilter]);
}
