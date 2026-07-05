import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isTypingTarget } from "@/shared/lib/shortcutMatch";

/**
 * Registers the shortcuts that apply everywhere, regardless of which app
 * (Projects, People, Workspace) is active: command palette, sidebar toggle,
 * the shortcut overlay, and navigation to workspace-level pages (members,
 * settings, notifications).
 *
 * App-specific shortcuts (task creation, board filters, org create/review, …)
 * live in that app's own hook — see useProjectsShortcuts and
 * usePeopleShortcuts — mounted only while that app's routes are active.
 *
 * @param {object} opts
 * @param {() => void} opts.onOpenPalette   — open ⌘K command palette
 * @param {() => void} opts.onOpenShortcuts — open ? shortcut overlay
 */

/**
 * Adding a new global shortcut - Say you want Shift+N to open notifications.
 * Step 1 — Register it in the registry (shortcutsRegistry.js:56):
  { keys: ["Shift+N"], display: ["⇧", "N"], description: "Open notifications" }
  This makes it appear in the ? overlay automatically.

 * Step 2 — Handle it in the hook (useWorkspaceShortcuts.js:27):
  Add the param and the case in the switch (or before it for modifier combos):

  export function useWorkspaceShortcuts({ ..., onOpenNotifications } = {}) {
    // inside the handler:
    if (e.shiftKey && e.key === "N") {
      e.preventDefault();
      onOpenNotifications?.();
      return;
    }
 * Step 3 — Wire the callback in AppLayout (AppLayout.jsx:92):
  useWorkspaceShortcuts({
    ...existing,
    onOpenNotifications: () => setNotificationsOpen(true),
});
 */

export function useWorkspaceShortcuts({
  onOpenPalette,
  onOpenShortcuts,
  onToggleSidebar,
  onOpenPermissions,
  onOpenProfile,
  onOpenSettings,
} = {}) {
  const navigate = useNavigate();
  const { workspaceId } = useParams();

  // Tracks the first key of a chord (e.g. "g" in "g m")
  const chordRef = useRef(null);
  const chordTimer = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    const ws = (path) => `/w/${workspaceId}/${path}`;
    const CHORD_MAP = {
      i: () =>
        window.dispatchEvent(new CustomEvent("jcn:toggle-notifications")),
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

        case "r":
          e.preventDefault();
          onOpenPermissions?.();
          break;

        case "u":
          e.preventDefault();
          onOpenProfile?.();
          break;

        case ",":
          e.preventDefault();
          onOpenSettings?.();
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
    onToggleSidebar,
    onOpenPermissions,
    onOpenProfile,
    onOpenSettings,
  ]);
}
