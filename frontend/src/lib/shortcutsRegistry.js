/**
 * Single source of truth for all keyboard shortcuts.
 * Consumed by:
 *   - useKeyboardShortcuts (registers handlers)
 *   - ShortcutOverlay (? overlay)
 *   - PreferencesPage > Shortcuts tab (settings page)
 */

export const SHORTCUT_GROUPS = [
  {
    id: "navigation",
    label: "Navigation",
    shortcuts: [
      {
        keys: ["g", "then", "p"],
        display: ["g", "p"],
        description: "Go to Projects",
      },
      {
        keys: ["g", "then", "d"],
        display: ["g", "d"],
        description: "Go to Dashboards",
      },
      {
        keys: ["g", "then", "m"],
        display: ["g", "m"],
        description: "Go to My Work",
      },
      {
        keys: ["g", "then", "i"],
        display: ["g", "i"],
        description: "Go to Inbox",
      },
      {
        keys: ["g", "then", "a"],
        display: ["g", "a"],
        description: "Go to Analytics",
      },
      {
        keys: ["g", "then", "g"],
        display: ["g", "g"],
        description: "Go to Goals",
      },
      { keys: ["⌘K"], display: ["⌘K"], description: "Open command palette" },
    ],
  },
  {
    id: "board",
    label: "Board & Task List",
    shortcuts: [
      {
        keys: ["c"],
        display: ["c"],
        description: "Create task (context-aware)",
      },
      {
        keys: ["ArrowUp", "ArrowDown"],
        display: ["↑", "↓"],
        description: "Navigate task list",
      },
      { keys: ["Enter"], display: ["Enter"], description: "Open focused task" },
      { keys: ["/"], display: ["/"], description: "Focus filter / search bar" },
      {
        keys: ["Escape"],
        display: ["Esc"],
        description: "Close panel · deselect task",
      },
    ],
  },
  {
    id: "task_actions",
    label: "Task Actions (task focused or panel open)",
    shortcuts: [
      { keys: ["e"], display: ["e"], description: "Edit task title inline" },
      { keys: ["a"], display: ["a"], description: "Assign task" },
      { keys: ["s"], display: ["s"], description: "Change status" },
      { keys: ["p"], display: ["p"], description: "Change priority" },
      { keys: ["l"], display: ["l"], description: "Add / remove label" },
      { keys: ["d"], display: ["d"], description: "Set due date" },
      { keys: ["t"], display: ["t"], description: "Start / stop timer" },
    ],
  },
  {
    id: "my_work",
    label: "My Work",
    shortcuts: [
      {
        keys: ["Space"],
        display: ["Space"],
        description: "Check / uncheck task",
      },
    ],
  },
  {
    id: "global",
    label: "Global",
    shortcuts: [
      { keys: ["?"], display: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
];

/** Flat list — useful for search or rendering a single table. */
export const ALL_SHORTCUTS = SHORTCUT_GROUPS.flatMap((g) =>
  g.shortcuts.map((s) => ({ ...s, group: g.label })),
);
