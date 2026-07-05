/**
 * Aggregated keyboard-shortcut registry — the single list every consumer reads.
 *
 * Like navLinks.js does for nav, this file AGGREGATES per-app shortcut groups
 * and tags each with the app it belongs to. Each product app owns its own
 * shortcuts in its folder (apps/<app>/shortcuts.js); workspace + global
 * shortcuts (which belong to no product app) live here.
 *
 *   app: "projects" | "people"  → product apps, shown only with app access
 *   app: "workspace"            → always shown (every member has workspace)
 *   app: "global"               → always shown (palette, overlay, esc, …)
 *
 * Consumed by:
 *   - useShortcutBindings (effective bindings for every handler, keyed by id)
 *   - useBoardShortcuts / usePeopleShortcuts / useWorkspaceShortcuts (handlers)
 *   - ShortcutOverlay, CommandPalette, Preferences > Shortcuts (DISPLAY — these
 *     use visibleShortcutGroups() so a user never sees an app's shortcuts they
 *     can't access)
 *   - Sidebar (nav hints via getNavShortcutDisplayMap)
 *
 * Each shortcut has a stable `id` — never reuse or rename it. `navKey` links a
 * nav shortcut to its sidebar nav item. `permission` (optional) hides a
 * shortcut from users lacking that workspace permission.
 */
import { PM_SHORTCUT_GROUPS } from "@/apps/project-management/shortcuts";
import { PEOPLE_SHORTCUT_GROUPS } from "@/apps/people/shortcuts";

// Workspace-level nav shortcuts — gated by settings.manage, always in the
// "workspace" app (never module-gated). Handled by useWorkspaceShortcuts.
const WORKSPACE_SHORTCUT_GROUPS = [
  {
    id: "workspace_nav",
    label: "Workspace",
    shortcuts: [
      { id: "nav:members", navKey: "members", keys: ["g", "then", "m"], display: ["g", "m"], description: "Go to Members", permission: "settings.manage" },
      { id: "nav:settings", navKey: "settings", keys: ["g", "then", "s"], display: ["g", "s"], description: "Go to Settings", permission: "settings.manage" },
    ],
  },
];

// Global shortcuts — fire everywhere, belong to no app. Handled by
// useWorkspaceShortcuts (mounted for the whole session in AppLayout).
const GLOBAL_SHORTCUT_GROUPS = [
  {
    id: "general",
    label: "General",
    shortcuts: [
      { id: "nav:notifications", navKey: "inbox", keys: ["g", "then", "i"], display: ["g", "i"], description: "Toggle notifications" },
      { id: "nav:sidebar", keys: ["Ctrl+."], display: ["Ctrl", "."], description: "Toggle sidebar" },
    ],
  },
  {
    id: "global",
    label: "Global",
    shortcuts: [
      { id: "global:close", keys: ["Escape"], display: ["Esc"], description: "Close modal / overlay" },
      { id: "global:shortcuts-overlay", keys: ["?"], display: ["?"], description: "Show keyboard shortcuts" },
      { id: "global:open-profile", keys: ["u"], display: ["u"], description: "Open profile menu" },
      { id: "global:open-settings", keys: [","], display: [","], description: "Open account settings" },
      { id: "global:open-permissions", keys: ["r"], display: ["r"], description: "Open permissions manager" },
    ],
  },
];

// The one aggregated list. Each app's groups are stamped with its app key here
// (the per-app files stay app-agnostic), so adding a shortcut to an app's
// shortcuts.js flows through automatically — no edits here needed.
export const SHORTCUT_GROUPS = [
  ...PM_SHORTCUT_GROUPS.map((g) => ({ ...g, app: "projects" })),
  ...PEOPLE_SHORTCUT_GROUPS.map((g) => ({ ...g, app: "people" })),
  ...WORKSPACE_SHORTCUT_GROUPS.map((g) => ({ ...g, app: "workspace" })),
  ...GLOBAL_SHORTCUT_GROUPS.map((g) => ({ ...g, app: "global" })),
];

/** Flat list — useful for search or rendering a single table. */
export const ALL_SHORTCUTS = SHORTCUT_GROUPS.flatMap((g) =>
  g.shortcuts.map((s) => ({ ...s, group: g.label, app: g.app })),
);

/**
 * The shortcut groups a user should SEE, given predicates for app access and
 * permission. "global"/"workspace" groups are always visible; product-app
 * groups require access. Per-shortcut `permission` (if any) is checked too, and
 * groups left empty after filtering are dropped.
 *
 * @param {(appKey: string) => boolean} canAccessApp  e.g. isOwner || hasAppAccess(app)
 * @param {(perm: string) => boolean}   hasPermission e.g. isOwner || can(perm)
 */
export function visibleShortcutGroups(canAccessApp, hasPermission = () => true) {
  return SHORTCUT_GROUPS.filter(
    (g) => g.app === "global" || g.app === "workspace" || canAccessApp(g.app),
  )
    .map((g) => ({
      ...g,
      shortcuts: g.shortcuts.filter(
        (s) => !s.permission || hasPermission(s.permission),
      ),
    }))
    .filter((g) => g.shortcuts.length > 0);
}

/**
 * Returns all shortcuts from the requested group ids (flat array).
 * Consumers use this to get a group's shortcuts without hardcoding ids.
 *
 * @example
 * // useBoardShortcuts — all shortcuts that fire when the task panel is open
 * const PANEL_SHORTCUTS = getShortcutsByGroup("task_actions", "task_panel");
 */
export function getShortcutsByGroup(...groupIds) {
  return SHORTCUT_GROUPS.filter((g) => groupIds.includes(g.id)).flatMap(
    (g) => g.shortcuts,
  );
}

/**
 * Returns a compact display string for a single shortcut id.
 * e.g. getShortcutDisplay("task:status") → "s"
 * Returns null if the id is not found.
 */
export function getShortcutDisplay(id) {
  const shortcut = ALL_SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) return null;
  return shortcut.display.join(" ");
}

/**
 * Returns a map of nav item key → display string for use in the Sidebar.
 * e.g. { boards: "g b", departments: "g e", ... }
 * Scans every group so any group can contribute nav hints via `navKey`.
 * Derived from the registry so Sidebar never maintains its own shortcut list.
 */
export function getNavShortcutDisplayMap() {
  return Object.fromEntries(
    ALL_SHORTCUTS.filter((s) => s.navKey).map((s) => [
      s.navKey,
      s.display.join(" "),
    ]),
  );
}
