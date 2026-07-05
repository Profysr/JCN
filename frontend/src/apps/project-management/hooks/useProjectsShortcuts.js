import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isTypingTarget } from "@/shared/lib/shortcutMatch";

/**
 * Project Management-only keyboard shortcuts. Mounted by ProjectsAppShell,
 * so these only fire while a Projects route is active — they used to live in
 * the global useWorkspaceShortcuts and fired everywhere, including People/HR
 * pages that have no boards/tasks to act on.
 *
 *   ⌘K / Ctrl+K — open the command palette (ProjectsAppShell listens for jcn:open-palette)
 *   c        — create task (context-aware, KanbanPage listens for jcn:create-task)
 *   Shift+F  — open/close the board filter panel (FilterBar listens for jcn:open-filters)
 *   /        — focus the board search box (FilterBar listens for jcn:focus-search)
 *   g b/d/w/a/g — go to boards / dashboards / my-work / analytics / goals
 */
export function useProjectsShortcuts() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();

  const chordRef = useRef(null);
  const chordTimer = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = (path) => `/w/${workspaceId}/${path}`;
    const CHORD_MAP = {
      b: () => navigate(ws("boards")),
      d: () => navigate(ws("dashboards")),
      w: () => navigate(ws("my-work")),
      a: () => navigate(ws("analytics")),
      g: () => navigate(ws("goals")),
    };

    const handler = (e) => {
      // ⌘K / Ctrl+K — command palette. Handled before the modifier guard below.
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("jcn:open-palette"));
        return;
      }

      const isModified = e.ctrlKey || e.metaKey || e.altKey;
      if (isTypingTarget(e) || isModified) return;

      // Shift+F — open/close filter panel
      if (e.shiftKey && e.key === "F") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("jcn:open-filters"));
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
          e.preventDefault();
          chordRef.current = "g";
          chordTimer.current = setTimeout(() => {
            chordRef.current = null;
          }, 1500);
          break;

        case "c":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("jcn:create-task"));
          break;

        case "/":
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("jcn:focus-search"));
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
  }, [workspaceId, navigate]);
}
