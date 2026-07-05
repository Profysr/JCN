import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useShortcutBindings } from "@/shared/hooks/useShortcutBindings";
import { isTypingTarget, matchesBinding } from "@/shared/lib/shortcutMatch";

/**
 * "g e/t/o/p/j/h/l/k" — go to Departments/Teams/Org Chart/People/Job Titles/
 * HR Overview/Leave/Attendance. Mounted once in ProfileSetupGate, which wraps
 * every People/HR route — mirrors useProjectsShortcuts' "g"-chord pattern,
 * scoped so these never fire on Projects/Workspace pages.
 */
export function usePeopleNavShortcuts() {
  const navigate = useNavigate();
  const { workspaceId } = useParams();

  const chordRef = useRef(null);
  const chordTimer = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = (path) => `/w/${workspaceId}/${path}`;
    const CHORD_MAP = {
      e: () => navigate(ws("departments")),
      t: () => navigate(ws("teams")),
      o: () => navigate(ws("org-chart")),
      p: () => navigate(ws("people")),
      j: () => navigate(ws("org/job-titles")),
      h: () => navigate(ws("hr")),
      l: () => navigate(ws("hr/leave")),
      k: () => navigate(ws("hr/attendance")),
    };

    const handler = (e) => {
      const isModified = e.ctrlKey || e.metaKey || e.altKey;
      if (isTypingTarget(e) || isModified) return;

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

      if (e.key === "g") {
        e.preventDefault();
        chordRef.current = "g";
        chordTimer.current = setTimeout(() => {
          chordRef.current = null;
        }, 1500);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(chordTimer.current);
    };
  }, [workspaceId, navigate]);
}

/**
 * People app-only keyboard shortcuts — the "org" group in shortcutsRegistry.js.
 * Kept as small, page-scoped hooks (not a single global handler mounted for
 * the whole People app) because "n" / arrows / Enter would otherwise collide
 * with normal typing and form navigation on pages that don't want them.
 */

/**
 * "n" — open the create modal. Used by DepartmentsPage and TeamsPage, which
 * previously each hand-rolled the same window keydown listener.
 */
export function useCreateShortcut(onCreate, { disabled = false } = {}) {
  const bindings = useShortcutBindings();

  useEffect(() => {
    if (disabled) return;
    const handler = (e) => {
      if (isTypingTarget(e)) return;
      if (matchesBinding(e, bindings["org:create"])) {
        e.preventDefault();
        onCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [bindings, disabled, onCreate]);
}
