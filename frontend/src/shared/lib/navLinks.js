import {
  FolderKanban,
  Network,
  Users2,
  Settings,
  Users,
  Plug,
  Key,
  Webhook,
} from "lucide-react";

import { PM_NAV_ITEMS, PM_NAV_GROUPS } from "@/apps/project-management/nav";
import { ORG_NAV_ITEMS, ORG_NAV_GROUPS } from "@/apps/org-structure/nav";
import { HR_NAV_ITEMS, HR_NAV_GROUPS } from "@/apps/hr-management/nav";

// ── App definitions ────────────────────────────────────────────────────────────

export const APP_DEFS = [
  {
    key: "projects",
    label: "Project Management",
    shortLabel: "Projects",
    moduleKey: null,
    permission: null,
    icon: FolderKanban,
  },
  {
    key: "org_structure",
    label: "Org Structure",
    shortLabel: "Org",
    moduleKey: "org_structure",
    permission: "org.view",
    icon: Network,
  },
  {
    key: "hr_management",
    label: "HR Management",
    shortLabel: "HR",
    moduleKey: "hr_management",
    permission: "hr.view",
    icon: Users2,
  },
  {
    key: "workspace",
    label: "Workspace",
    shortLabel: "Workspace",
    moduleKey: null,
    permission: null,
    icon: Settings,
  },
];

export const APP_LANDING = {
  projects: "boards",
  org_structure: "departments",
  hr_management: "hr",
  workspace: "members",
};

// ── Workspace-level nav ────────────────────────────────────────────────────────
// Items that govern the workspace itself, not any individual app.

export const WORKSPACE_NAV_ITEMS = [
  {
    key: "members",
    icon: Users,
    label: "Members",
    desc: "Manage team members",
    path: "members",
  },
  {
    key: "settings",
    icon: Settings,
    label: "Settings",
    desc: "Workspace settings",
    path: "settings",
    end: true,
  },
  {
    key: "integrations",
    icon: Plug,
    label: "Integrations",
    desc: "Teams, Google Chat webhooks",
    path: "settings/integrations",
  },
  {
    key: "api-keys",
    icon: Key,
    label: "API Keys",
    desc: "Programmatic API access",
    path: "settings/api",
  },
  {
    key: "webhooks",
    icon: Webhook,
    label: "Webhooks",
    desc: "Outbound event webhooks",
    path: "settings/webhooks",
  },
];

const WORKSPACE_NAV_GROUPS = [
  {
    label: "Workspace",
    items: ["members", "settings", "integrations", "api-keys", "webhooks"],
  },
];

// ── Aggregated exports (backward compat — command palette, search, etc.) ──────

export const NAV_ITEMS = [
  ...PM_NAV_ITEMS,
  ...ORG_NAV_ITEMS,
  ...HR_NAV_ITEMS,
  ...WORKSPACE_NAV_ITEMS,
];

export const NAV_GROUPS = [
  ...PM_NAV_GROUPS.map((g) => ({ ...g, app: "projects" })),
  ...ORG_NAV_GROUPS.map((g) => ({ ...g, app: "org_structure" })),
  ...HR_NAV_GROUPS.map((g) => ({ ...g, app: "hr_management" })),
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
