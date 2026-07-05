/**
 * Single source of truth for all keyboard shortcuts.
 * Consumed by:
 *   - useWorkspaceShortcuts (global handlers: palette, sidebar toggle, overlay,
 *     "?", plus the workspace-level "g m"/"g s"/"g i" nav chords)
 *   - useProjectsShortcuts (Project Management app: "g b/d/w/a/g", c, Shift+F, /)
 *   - useBoardShortcuts (board-local handlers)
 *   - usePeopleShortcuts (People app: org:create, org:review-*)
 *   - useShortcutBindings (returns effective bindings for all consumers)
 *   - ShortcutOverlay (? overlay)
 *   - PreferencesPage > Shortcuts tab (settings page)
 *   - Sidebar (nav shortcut hints via getNavShortcutDisplayMap)
 *
 * Each shortcut has a stable `id` — the key used by useShortcutBindings and,
 * in future, user customization overrides. Never reuse or rename an id.
 *
 * `navKey` on navigation shortcuts links them to sidebar nav item keys so
 * Sidebar can derive its shortcut hints from the registry instead of
 * maintaining a separate hardcoded map.
 */
export const SHORTCUT_GROUPS = [
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [
      {
        id: "nav:boards",
        navKey: "boards",
        keys: ["g", "then", "b"],
        display: ["g", "b"],
        description: "Go to Boards",
      },
      {
        id: "nav:dashboards",
        navKey: "dashboards",
        keys: ["g", "then", "d"],
        display: ["g", "d"],
        description: "Go to Dashboards",
      },
      {
        id: "nav:my-work",
        navKey: "my-work",
        keys: ["g", "then", "w"],
        display: ["g", "w"],
        description: "Go to My Work",
      },
      {
        id: "nav:notifications",
        navKey: "inbox",
        keys: ["g", "then", "i"],
        display: ["g", "i"],
        description: "Toggle notifications",
      },
      {
        id: "nav:analytics",
        navKey: "analytics",
        keys: ["g", "then", "a"],
        display: ["g", "a"],
        description: "Go to Analytics",
      },
      {
        id: "nav:goals",
        navKey: "goals",
        keys: ["g", "then", "g"],
        display: ["g", "g"],
        description: "Go to Goals",
      },
      {
        id: "nav:members",
        navKey: "members",
        keys: ["g", "then", "m"],
        display: ["g", "m"],
        description: "Go to Members",
      },
      {
        id: "nav:settings",
        navKey: "settings",
        keys: ["g", "then", "s"],
        display: ["g", "s"],
        description: "Go to Settings",
      },
      {
        id: "nav:palette",
        keys: ["⌘K"],
        display: ["⌘K"],
        description: "Open command palette",
      },
      {
        id: "nav:sidebar",
        keys: ["Ctrl+."],
        display: ["Ctrl", "."],
        description: "Toggle sidebar",
      },
    ],
  },
  {
    id: "board",
    label: "Board & Task List",
    shortcuts: [
      {
        id: "board:create-task",
        keys: ["c"],
        display: ["c"],
        description: "Create task (context-aware)",
      },
      {
        id: "board:open-filters",
        keys: ["Shift+F"],
        display: ["⇧", "F"],
        description: "Open / close filter panel",
      },
      {
        id: "board:focus-up",
        keys: ["ArrowUp"],
        display: ["↑"],
        description: "Navigate task list (up)",
      },
      {
        id: "board:focus-down",
        keys: ["ArrowDown"],
        display: ["↓"],
        description: "Navigate task list (down)",
      },
      {
        id: "board:open-task",
        keys: ["Enter"],
        display: ["Enter"],
        description: "Open focused task",
      },
      {
        id: "board:focus-search",
        keys: ["/"],
        display: ["/"],
        description: "Focus filter / search bar",
      },
      {
        id: "board:close",
        keys: ["Escape"],
        display: ["Esc"],
        description: "Close panel · deselect task",
      },
    ],
  },
  {
    id: "task_actions",
    label: "Task Actions (panel open)",
    shortcuts: [
      {
        id: "task:edit-title",
        keys: ["z", "then", "t"],
        display: ["z", "t"],
        description: "Edit task title",
      },
      {
        id: "task:edit-description",
        keys: ["z", "then", "e"],
        display: ["z", "e"],
        description: "Edit description",
      },
      {
        id: "task:assign",
        keys: ["z", "then", "a"],
        display: ["z", "a"],
        description: "Assign task",
      },
      {
        id: "task:status",
        keys: ["z", "then", "s"],
        display: ["z", "s"],
        description: "Change status",
      },
      {
        id: "task:priority",
        keys: ["z", "then", "p"],
        display: ["z", "p"],
        description: "Change priority",
      },
      {
        id: "task:label",
        keys: ["z", "then", "l"],
        display: ["z", "l"],
        description: "Add / remove label",
      },
      {
        id: "task:due-date",
        keys: ["z", "then", "d"],
        display: ["z", "d"],
        description: "Set due date",
      },
      {
        id: "task:copy-link",
        keys: ["z", "then", "y"],
        display: ["z", "y"],
        description: "Copy task link",
      },
      {
        id: "task:clone",
        keys: ["z", "then", "u"],
        display: ["z", "u"],
        description: "Duplicate task",
      },
      {
        id: "task:open-approval",
        keys: ["z", "then", "v"],
        display: ["z", "v"],
        description: "Request / view approval",
      },
      {
        id: "task:delete",
        keys: ["z", "then", "Backspace"],
        display: ["z", "Backspace"],
        description: "Delete task",
      },
      {
        id: "task:child-new",
        keys: ["z", "then", "h"],
        display: ["z", "h"],
        description: "Add child task",
      },
      {
        id: "task:child-attach",
        keys: ["z", "then", "g"],
        display: ["z", "g"],
        description: "Attach existing child task",
      },
      {
        id: "task:subtask-new",
        keys: ["z", "then", "k"],
        display: ["z", "k"],
        description: "Add subtask / checklist item",
      },
    ],
  },
  {
    id: "task_panel",
    label: "Task Panel Tabs",
    shortcuts: [
      {
        id: "panel:tab-comments",
        keys: ["z", "then", "c"],
        display: ["z", "c"],
        description: "Switch to Comments tab",
      },
      {
        id: "panel:tab-activity",
        keys: ["z", "then", "i"],
        display: ["z", "i"],
        description: "Switch to Activity tab",
      },
      {
        id: "panel:tab-approvals",
        keys: ["z", "then", "r"],
        display: ["z", "r"],
        description: "Switch to Approvals tab",
      },
      {
        id: "panel:focus-comment",
        keys: ["z", "then", "m"],
        display: ["z", "m"],
        description: "Open comments & focus input",
      },
    ],
  },
  {
    id: "my_work",
    label: "My Work",
    shortcuts: [
      {
        id: "my-work:toggle-done",
        keys: ["Space"],
        display: ["Space"],
        description: "Check / uncheck task",
      },
    ],
  },
  {
    id: "org",
    label: "Org Structure",
    shortcuts: [
      {
        id: "org:create",
        keys: ["n"],
        display: ["n"],
        description: "New department / team",
      },
      {
        id: "org:review-prev",
        keys: ["ArrowLeft"],
        display: ["←"],
        description: "Previous pending profile",
      },
      {
        id: "org:review-next",
        keys: ["ArrowRight"],
        display: ["→"],
        description: "Next pending profile",
      },
      {
        id: "org:review-approve",
        keys: ["Enter"],
        display: ["Enter"],
        description: "Approve profile (HR review modal)",
      },
    ],
  },
  {
    id: "global",
    label: "Global",
    shortcuts: [
      {
        id: "global:close",
        keys: ["Escape"],
        display: ["Esc"],
        description: "Close modal / overlay",
      },
      {
        id: "global:shortcuts-overlay",
        keys: ["?"],
        display: ["?"],
        description: "Show keyboard shortcuts",
      },
      {
        id: "global:open-profile",
        keys: ["u"],
        display: ["u"],
        description: "Open profile menu",
      },
      {
        id: "global:open-settings",
        keys: [","],
        display: [","],
        description: "Open account settings",
      },
      {
        id: "global:open-permissions",
        keys: ["r"],
        display: ["r"],
        description: "Open permissions manager",
      },
    ],
  },
];

/** Flat list — useful for search or rendering a single table. */
export const ALL_SHORTCUTS = SHORTCUT_GROUPS.flatMap((g) =>
  g.shortcuts.map((s) => ({ ...s, group: g.label })),
);

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
 *      getShortcutDisplay("task:clone")  → "⇧ D"
 * Returns null if the id is not found.
 */
export function getShortcutDisplay(id) {
  const shortcut = ALL_SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) return null;
  return shortcut.display.join(" ");
}

/**
 * Returns a map of nav item key → display string for use in the Sidebar.
 * e.g. { boards: "g b", dashboards: "g d", ... }
 * Derived from the registry so Sidebar never maintains its own shortcut list.
 */
export function getNavShortcutDisplayMap() {
  return Object.fromEntries(
    SHORTCUT_GROUPS.find((g) => g.id === "navigation")
      .shortcuts.filter((s) => s.navKey)
      .map((s) => [s.navKey, s.display.join(" ")]),
  );
}
