import { useLocation } from "react-router-dom";
import { NAV_GROUPS, NAV_ITEMS } from "@/shared/lib/navLinks";

const _byKey = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n]));

/**
 * Derived from nav definitions — adding a page to any app's nav.js
 * automatically updates this mapping, no manual maintenance needed.
 */
const SEGMENT_TO_APP = {
  apps: "launcher",
  ...Object.fromEntries(
    NAV_GROUPS.flatMap((g) =>
      g.items.map((key) => [_byKey[key].path.split("/")[0], g.app])
    )
  ),
};

/**
 * Returns the active app key based on the current URL.
 * Reactive — updates whenever the route changes.
 */
export function useActiveApp() {
  const { pathname } = useLocation();
  const segment = pathname.split("/")[3];
  return SEGMENT_TO_APP[segment] ?? "projects";
}
