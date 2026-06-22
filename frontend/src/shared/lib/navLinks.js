import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Users2,
  Building2,
  Network,
  Settings,
  Target,
  BarChart2,
  Plug,
  Key,
  Webhook,
  Upload,
  Inbox,
  CalendarDays,
  Timer,
  BarChart3,
} from "lucide-react";

/** App definitions — used by the app launcher page. */
export const APP_DEFS = [
  { key: "projects", label: "Projects", shortLabel: "Projects", moduleKey: null, icon: FolderKanban },
  { key: "org_structure", label: "Org Structure", shortLabel: "Org", moduleKey: "org_structure", icon: Network },
  { key: "hr_management", label: "HR Management", shortLabel: "HR", moduleKey: "hr_management", icon: Users2 },
  { key: "workspace", label: "Workspace", shortLabel: "Workspace", moduleKey: null, icon: Settings },
];

/** Maps app key → the path to navigate to when switching into that app. */
export const APP_LANDING = {
  projects: "boards",
  org_structure: "departments",
  hr_management: "hr",
  workspace: "members",
};

/**
 * Single source of truth for workspace navigation items.
 * Used by AppLayout (NavLink `to`) and CommandPalette (action + desc).
 */
export const NAV_ITEMS = [
  {
    key: "dashboards",
    icon: LayoutDashboard,
    label: "Dashboards",
    desc: "Overview & analytics",
    path: "dashboards",
  },
  {
    key: "boards",
    icon: FolderKanban,
    label: "Boards",
    desc: "All boards",
    path: "boards",
    collapsible: true,
  },
  {
    key: "my-work",
    icon: Inbox,
    label: "My Work",
    desc: "Tasks assigned to you",
    path: "my-work",
  },
  {
    key: "goals",
    icon: Target,
    label: "Goals",
    desc: "OKRs & objectives",
    path: "goals",
  },
  {
    key: "analytics",
    icon: BarChart2,
    label: "Analytics",
    desc: "Velocity, flow & team metrics",
    path: "analytics",
    permission: "report.view",
  },
  // {
  //   key: "roadmap",
  //   icon: Map,
  //   label: "Roadmap",
  //   desc: "Sprint timeline",
  //   path: "roadmap",
  // },
  {
    key: "departments",
    icon: Building2,
    label: "Departments",
    desc: "Company departments & structure",
    path: "departments",
    permission: "org.view",
    moduleKey: "org_structure",
  },
  {
    key: "teams",
    icon: Users2,
    label: "Teams",
    desc: "Teams & their members",
    path: "teams",
    permission: "org.view",
    moduleKey: "org_structure",
  },
  {
    key: "org-chart",
    icon: Network,
    label: "Org Chart",
    desc: "Company org chart",
    path: "org-chart",
    permission: "org.view",
    moduleKey: "org_structure",
  },
  {
    key: "hr-dashboard",
    icon: BarChart3,
    label: "HR Overview",
    desc: "Headcount, leave & attendance summary",
    path: "hr",
    permission: "hr.view",
    moduleKey: "hr_management",
    end: true,
  },
  {
    key: "hr-leave",
    icon: CalendarDays,
    label: "Leave",
    desc: "Leave requests & balances",
    path: "hr/leave",
    permission: "hr.view",
    moduleKey: "hr_management",
  },
  {
    key: "hr-attendance",
    icon: Timer,
    label: "Attendance",
    desc: "Clock-in/out & team hours",
    path: "hr/attendance",
    permission: "hr.view",
    moduleKey: "hr_management",
  },
  {
    key: "members",
    icon: Users,
    label: "Members",
    desc: "Manage team members",
    path: "members",
    workspaceLevel: true,
  },
  {
    key: "integrations",
    icon: Plug,
    label: "Integrations",
    desc: "Teams, Google Chat webhooks",
    path: "settings/integrations",
    workspaceLevel: true,
  },
  {
    key: "api-keys",
    icon: Key,
    label: "API Keys",
    desc: "Programmatic API access",
    path: "settings/api",
    workspaceLevel: true,
  },
  {
    key: "webhooks",
    icon: Webhook,
    label: "Webhooks",
    desc: "Outbound event webhooks",
    path: "settings/webhooks",
    workspaceLevel: true,
  },
  {
    key: "import",
    icon: Upload,
    label: "Import",
    desc: "Migrate from Jira, Trello, ClickUp…",
    path: "settings/import",
    workspaceLevel: true,
  },
  {
    key: "settings",
    icon: Settings,
    label: "Settings",
    desc: "Workspace settings",
    path: "settings",
    end: true,
    workspaceLevel: true,
  },
];

/**
 * Grouped nav — used by the sidebar to render section labels between links.
 * `app` ties a group to an app context so the sidebar can filter by active app.
 */
export const NAV_GROUPS = [
  {
    label: null,
    app: "projects",
    items: ["dashboards", "boards"],
  },
  {
    label: "Work",
    app: "projects",
    items: ["my-work", "goals"],
  },
  {
    label: "Insights",
    app: "projects",
    items: ["analytics"],
  },
  {
    label: "People",
    app: "org_structure",
    items: ["departments", "teams", "org-chart"],
  },
  {
    label: "HR",
    app: "hr_management",
    items: ["hr-dashboard", "hr-leave", "hr-attendance"],
  },
  {
    label: "Workspace",
    app: "workspace",
    items: [
      "members",
      "integrations",
      "api-keys",
      "webhooks",
      "import",
      "settings",
    ],
  },
];

const _byKey = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n]));

/** Returns NAV_GROUPS with full item objects resolved. */
export function resolvedNavGroups() {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((k) => _byKey[k]),
  }));
}

export function workspaceUrl(id, path) {
  return `/w/${id}/${path}`;
}
