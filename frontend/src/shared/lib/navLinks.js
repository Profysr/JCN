import {
  FolderKanban,
  Network,
  Users2,
  Settings,
  Users,
  Plug,
  Key,
  Webhook,
  BarChart2,
} from "lucide-react";

import { PM_NAV_ITEMS, PM_NAV_GROUPS } from "@/apps/project-management/nav";
import { ORG_NAV_ITEMS, ORG_NAV_GROUPS } from "@/apps/org-structure/nav";
import { HR_NAV_ITEMS, HR_NAV_GROUPS } from "@/apps/hr-management/nav";

// ── App definitions ─────────────────────────────────────────────────────────
// Single source of truth for every product app in the workspace.
// Keys must match the backend APP_REGISTRY keys exactly.
//
// Fields consumed across the codebase:
//   icon       → AppSwitcher, AppLauncher, RolesSection, ModuleUnavailable
//   landing    → route suffix after /w/:id/ when switching to this app
//   colors     → icon bubble bg / icon text / active dot / accent bar
//   welcome    → AppWelcomeScreen copy  (null = no welcome screen shown)
//   locked     → ModuleUnavailablePage copy  (null = never locked)

export const APP_DEFS = [
  {
    key: "projects",
    label: "Project Management",
    shortLabel: "Projects",
    icon: FolderKanban,
    landing: "boards",
    colors: {
      bg: "bg-violet-500/15",
      text: "text-violet-500",
      solid: "bg-violet-500",
    },
    welcome: null,
    locked: null,
  },
  {
    key: "org",
    label: "Org Structure",
    shortLabel: "Org",
    icon: Network,
    landing: "departments",
    colors: {
      bg: "bg-blue-500/15",
      text: "text-blue-500",
      solid: "bg-blue-500",
    },
    welcome: {
      tagline: "Your company, clearly mapped.",
      description:
        "Build a living org chart that reflects how your team is actually structured — departments, teams, reporting lines, and job titles all in one place.",
      setupItems: [
        "Create your top-level departments (e.g. Engineering, Design, Operations)",
        "Add teams within each department and assign members",
        "Set manager relationships to build out the reporting hierarchy",
        "Assign job titles so every member's role is visible at a glance",
      ],
      ctaLabel: "Set up Org Structure",
    },
    locked: null,
  },
  {
    key: "hr",
    label: "HR Management",
    shortLabel: "HR",
    icon: Users2,
    landing: "hr",
    colors: {
      bg: "bg-purple-500/15",
      text: "text-purple-500",
      solid: "bg-purple-500",
    },
    welcome: {
      tagline: "Leave, attendance, and employee records — unified.",
      description:
        "Give your team a single place to request leave, clock in and out, and keep employee records up to date. Managers get the visibility they need without the spreadsheets.",
      setupItems: [
        "Define leave policies (annual leave, sick leave, etc.) with accrual rules",
        "Enrol employees so they can start submitting requests",
        "Configure attendance settings for clock-in/out and QR check-in",
        "Review the HR overview dashboard to monitor balances and absences",
      ],
      ctaLabel: "Set up HR Management",
    },
    locked: null,
  },
  {
    key: "analytics",
    label: "Advanced Analytics",
    shortLabel: "Analytics",
    icon: BarChart2,
    landing: "analytics",
    colors: {
      bg: "bg-amber-500/15",
      text: "text-amber-500",
      solid: "bg-amber-500",
    },
    welcome: null,
    locked: null,
  },
  {
    key: "workspace",
    label: "Workspace",
    shortLabel: "Workspace",
    icon: Settings,
    landing: "members",
    colors: {
      bg: "bg-slate-500/15",
      text: "text-slate-400",
      solid: "bg-slate-400",
    },
    welcome: null,
    locked: null,
  },
];

// Derived lookup — kept for backward compatibility with any direct APP_LANDING[key] usage.
export const APP_LANDING = Object.fromEntries(APP_DEFS.map((a) => [a.key, a.landing]));

// ── Workspace-level nav ───────────────────────────────────────────────────────
export const WORKSPACE_NAV_ITEMS = [
  {
    key: "members",
    icon: Users,
    label: "Members",
    desc: "Manage team members",
    path: "members",
    permission: "settings.manage",
  },
  {
    key: "integrations",
    icon: Plug,
    label: "Integrations",
    desc: "Teams, Google Chat webhooks",
    path: "settings/integrations",
    permission: "settings.manage",
  },
  {
    key: "api-keys",
    icon: Key,
    label: "API Keys",
    desc: "Programmatic API access",
    path: "settings/api",
    permission: "settings.manage",
  },
  {
    key: "webhooks",
    icon: Webhook,
    label: "Webhooks",
    desc: "Outbound event webhooks",
    path: "settings/webhooks",
    permission: "settings.manage",
  },
  {
    key: "settings",
    icon: Settings,
    label: "Settings",
    desc: "Workspace settings",
    path: "settings",
    end: true,
    permission: "settings.manage",
  },
];

export const WORKSPACE_NAV_GROUPS = [
  {
    label: "Workspace",
    items: ["members", "integrations", "api-keys", "webhooks", "settings"],
  },
];

// ── Aggregated nav registry ───────────────────────────────────────────────────
export const NAV_ITEMS = [
  ...PM_NAV_ITEMS,
  ...ORG_NAV_ITEMS,
  ...HR_NAV_ITEMS,
  ...WORKSPACE_NAV_ITEMS,
];

export const NAV_GROUPS = [
  ...PM_NAV_GROUPS.map((g) => ({ ...g, app: "projects" })),
  ...ORG_NAV_GROUPS.map((g) => ({ ...g, app: "org" })),
  ...HR_NAV_GROUPS.map((g) => ({ ...g, app: "hr" })),
  ...WORKSPACE_NAV_GROUPS.map((g) => ({ ...g, app: "workspace" })),
];

const _byKey = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n]));

export function resolvedNavGroups() {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.map((k) => _byKey[k]),
  }));
}

export function workspaceUrl(id, path) {
  return `/w/${id}/${path}`;
}
