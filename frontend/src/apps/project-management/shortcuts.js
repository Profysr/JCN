/**
 * Project Management keyboard shortcuts — this app owns them, exactly like it
 * owns its nav (see nav.js). The shared registry (shared/lib/shortcutsRegistry)
 * aggregates every app's groups, tags them with `app: "projects"`, and the
 * display surfaces (? overlay, ⌘K palette, Preferences tab) only show them to
 * users with projects access — see visibleShortcutGroups().
 *
 * `navKey` links a nav shortcut to its sidebar nav item so the Sidebar can
 * render the hint. `permission` (optional) mirrors the nav item's permission so
 * the shortcut is hidden from users who can't reach the page.
 *
 * Group ids are stable — handlers key off them (useBoardShortcuts reads
 * "task_actions"/"task_panel") and off shortcut ids (useShortcutBindings).
 * Never rename or reuse an id.
 */
export const PM_SHORTCUT_GROUPS = [
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
        id: "nav:analytics",
        navKey: "analytics",
        keys: ["g", "then", "a"],
        display: ["g", "a"],
        description: "Go to Analytics",
        permission: "pm.view_analytics",
      },
      {
        id: "nav:goals",
        navKey: "goals",
        keys: ["g", "then", "g"],
        display: ["g", "g"],
        description: "Go to Goals",
      },
      {
        id: "nav:palette",
        keys: ["⌘ + K"],
        display: ["⌘ + K"],
        description: "Open command palette",
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
];
