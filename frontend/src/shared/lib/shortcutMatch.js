/**
 * Shared keydown-matching helpers for shortcut hooks (useWorkspaceShortcuts,
 * useProjectsShortcuts, useBoardShortcuts, usePeopleShortcuts, ...). Single
 * source so every hook interprets useShortcutBindings() output the same way.
 */

/** True when the event originates from an interactive element — shortcuts are suppressed so typing still works. */
export function isTypingTarget(e) {
  const tag = e.target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    e.target.isContentEditable
  );
}

/**
 * True when the keydown event matches a binding definition.
 * Supports plain keys ("ArrowDown") and modifier combos ("Shift+F").
 * Chord shortcuts (["z", "then", "t"]) are excluded — callers handle those
 * with their own chord state machine.
 */
export function matchesBinding(e, keys) {
  if (!keys?.length || keys.includes("then")) return false;
  const key = keys[0];
  if (key.includes("+")) {
    const [modifier, k] = key.split("+");
    if (modifier === "Shift")
      return e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === k;
    if (modifier === "Ctrl") return (e.ctrlKey || e.metaKey) && e.key === k;
    return false;
  }
  // Plain key — must have no modifiers active
  return !e.shiftKey && e.key === key;
}
