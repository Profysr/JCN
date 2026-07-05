import { Users2 } from "lucide-react";

/**
 * People & HR app definition — presentation metadata this app owns, the same
 * way it owns its nav (nav.js) and shortcuts (shortcuts.js). Aggregated into
 * APP_DEFS by shared/lib/navLinks.js.
 *
 * `key` MUST match the backend APP_REGISTRY key (workspaces/constants.py). One
 * frontend app and one backend app ("people") covers Org Structure + HR, since
 * HR's data model is built entirely on org data. Icon and colors are
 * frontend-only; `landing` is the route opened when switching to this app.
 */
export const PEOPLE_APP = {
  key: "people",
  label: "People & HR",
  shortLabel: "People",
  icon: Users2,
  landing: "departments",
  colors: {
    bg: "bg-blue-500/15",
    text: "text-blue-500",
    solid: "bg-blue-500",
  },
};
