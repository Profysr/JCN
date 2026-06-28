import { useEffect, useRef } from "react";
import { useShortcutBindings } from "@/shared/hooks/useShortcutBindings";
import { getShortcutsByGroup } from "@/shared/lib/shortcutsRegistry";

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
 * Returns true when the keyboard event matches a binding definition.
 * Supports plain keys ("ArrowDown") and modifier combos ("Shift+F").
 * Chord shortcuts (["z", "then", "t"]) are excluded — handled by the chord
 * state machine in useBoardShortcuts.
 */
function matchesBinding(e, keys) {
  if (!keys?.length || keys.includes("then")) return false;
  const key = keys[0];
  if (key.includes("+")) {
    const [modifier, k] = key.split("+");
    if (modifier === "Shift") return e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === k;
    if (modifier === "Ctrl") return (e.ctrlKey || e.metaKey) && e.key === k;
    return false;
  }
  // Plain key — must have no modifiers active
  return !e.shiftKey && e.key === key;
}

/**
 * Shortcuts that fire (as `jcn:task-action` events) when the task panel is open.
 * Pulled from registry groups — to add more, add a shortcut to the right group
 * in shortcutsRegistry.js. No change needed here.
 *
 * Groups included:
 *   task_actions — property + action shortcuts (e, a, s, p, l, d, y, Shift+D …)
 *   task_panel   — panel tab + input shortcuts (1, 2, 3, i)
 */
const PANEL_OPEN_SHORTCUTS = getShortcutsByGroup("task_actions", "task_panel");

/**
 * Board-local keyboard shortcuts for KanbanPage.
 *
 * Global shortcuts (c, ?, /, Ctrl+K, g-chords, Shift+F) are handled by
 * useKeyboardShortcuts in AppLayout. This hook owns shortcuts scoped to a
 * board context:
 *
 *   board:focus-up / board:focus-down — move keyboard focus through the task list
 *   board:open-task                   — open the focused task in the detail panel
 *   board:close                       — close the panel or clear keyboard focus
 *   task_actions + task_panel groups  — fire jcn:task-action when panel is open
 *
 * All key bindings are read from useShortcutBindings() so future user
 * customization requires no changes here.
 */
export function useBoardShortcuts({
  tasks = [],
  selectedTaskId,
  focusedTaskId,
  setFocusedTaskId,
  onOpenTask,
  onCloseTask,
}) {
  const bindings = useShortcutBindings();
  const chordRef = useRef(null);
  const chordTimerRef = useRef(null);

  useEffect(() => {
    // Build second-key → shortcut-id map for all "z then X" task shortcuts
    const taskChordMap = {};
    for (const { id } of PANEL_OPEN_SHORTCUTS) {
      const keys = bindings[id];
      if (keys?.length >= 3 && keys[1] === "then") {
        taskChordMap[keys[2].toLowerCase()] = id;
      }
    }

    const handler = (e) => {
      if (isTypingTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;

      // ── Resolve pending "z ..." chord ────────────────────────────────────
      if (chordRef.current === "z") {
        clearTimeout(chordTimerRef.current);
        chordRef.current = null;
        if (selectedTaskId) {
          const id = taskChordMap[e.key.toLowerCase()];
          if (id) {
            e.preventDefault();
            window.dispatchEvent(
              new CustomEvent("jcn:task-action", {
                detail: { action: id.split(":")[1] },
              }),
            );
          }
        }
        return;
      }

      // ── Arrow navigation ─────────────────────────────────────────────────
      const isDown = matchesBinding(e, bindings["board:focus-down"]);
      const isUp = matchesBinding(e, bindings["board:focus-up"]);
      if (isDown || isUp) {
        if (!tasks.length) return;
        e.preventDefault();
        const idx = tasks.findIndex((t) => t.id === focusedTaskId);
        const next = isDown
          ? idx === -1 ? 0 : Math.min(tasks.length - 1, idx + 1)
          : idx === -1 ? tasks.length - 1 : Math.max(0, idx - 1);
        setFocusedTaskId(tasks[next]?.id ?? null);
        return;
      }

      // ── Enter — open focused task ────────────────────────────────────────
      if (matchesBinding(e, bindings["board:open-task"]) && focusedTaskId) {
        e.preventDefault();
        onOpenTask(focusedTaskId);
        return;
      }

      // ── Escape — close panel, then clear focus ───────────────────────────
      if (matchesBinding(e, bindings["board:close"])) {
        if (selectedTaskId) {
          onCloseTask();
        } else if (focusedTaskId) {
          setFocusedTaskId(null);
        }
        return;
      }

      // ── "z" — start task-action chord (panel must be open) ───────────────
      if (e.key === "z" && !e.shiftKey && selectedTaskId) {
        e.preventDefault();
        chordRef.current = "z";
        chordTimerRef.current = setTimeout(() => {
          chordRef.current = null;
        }, 1500);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      clearTimeout(chordTimerRef.current);
      chordRef.current = null;
    };
  }, [
    bindings,
    tasks,
    selectedTaskId,
    focusedTaskId,
    setFocusedTaskId,
    onOpenTask,
    onCloseTask,
  ]);
}
