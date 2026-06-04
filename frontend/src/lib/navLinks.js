import {
  LayoutDashboard, FolderKanban, Inbox, Briefcase,
  Map, Clock, Users, Settings, Bell, Target,
} from "lucide-react";

/**
 * Single source of truth for workspace navigation items.
 * Used by AppLayout (NavLink `to`) and CommandPalette (action + desc).
 */
export const NAV_ITEMS = [
  { key: "dashboards", icon: LayoutDashboard, label: "Dashboards", desc: "Overview & analytics",    path: "dashboards" },
  { key: "projects",   icon: FolderKanban,    label: "Projects",   desc: "All projects",            path: "projects"   },
  { key: "inbox",      icon: Bell,            label: "Inbox",      desc: "Notifications & updates",  path: "inbox"      },
  { key: "my-work",    icon: Inbox,           label: "My Work",    desc: "Tasks assigned to you",   path: "my-work"    },
  { key: "goals",      icon: Target,          label: "Goals",      desc: "OKRs & objectives",       path: "goals"      },
  { key: "portfolio",  icon: Briefcase,       label: "Portfolio",  desc: "Cross-project health",    path: "portfolio"  },
  { key: "roadmap",    icon: Map,             label: "Roadmap",    desc: "Sprint timeline",         path: "roadmap"    },
  { key: "timesheets", icon: Clock,           label: "Timesheets", desc: "Time tracking",           path: "timesheets" },
  { key: "members",    icon: Users,           label: "Members",    desc: "Manage team members",     path: "members"    },
  { key: "settings",   icon: Settings,        label: "Settings",   desc: "Workspace settings",      path: "settings"   },
];

/** Grouped nav — used by the sidebar to render section labels between links. */
export const NAV_GROUPS = [
  {
    label: null,
    items: ["dashboards", "projects"],
  },
  {
    label: "Work",
    items: ["inbox", "my-work", "goals"],
  },
  {
    label: "Views",
    items: ["portfolio", "roadmap", "timesheets"],
  },
  {
    label: "Workspace",
    items: ["members", "settings"],
  },
];

const _byKey = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n]));

/** Returns NAV_GROUPS with full item objects resolved. */
export function resolvedNavGroups() {
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.map((k) => _byKey[k]) }));
}

export function workspaceUrl(slug, path) {
  return `/w/${slug}/${path}`;
}
