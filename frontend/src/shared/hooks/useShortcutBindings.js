import { SHORTCUT_GROUPS } from "@/shared/lib/shortcutsRegistry";

/**
 * Returns the effective shortcut bindings as { [shortcutId]: keys[] }.
 *
 * Currently returns the registry defaults. When user customization lands,
 * merge user overrides from the API / localStorage here — callers need
 * no changes since they already key off shortcut ids.
 */
export function useShortcutBindings() {
  return DEFAULT_BINDINGS;
}

/** Pre-computed so the object reference is stable across renders. */
const DEFAULT_BINDINGS = Object.fromEntries(
  SHORTCUT_GROUPS.flatMap((g) => g.shortcuts).map((s) => [s.id, s.keys]),
);
