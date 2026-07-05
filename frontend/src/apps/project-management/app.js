import { FolderKanban } from "lucide-react";

/**
 * Project Management app definition — presentation metadata this app owns, the
 * same way it owns its nav (nav.js) and shortcuts (shortcuts.js). Aggregated
 * into APP_DEFS by shared/lib/navLinks.js.
 *
 * `key` MUST match the backend APP_REGISTRY key (workspaces/constants.py) — it's
 * how app access (app_access), permissions, and notifications line up. Icon and
 * colors are frontend-only (a React component + Tailwind classes) and have no
 * backend equivalent; `landing` is the route opened when switching to this app.
 */
export const PROJECTS_APP = {
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
};
