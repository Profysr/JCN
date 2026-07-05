import { useLocation } from "react-router-dom";
import { NAV_GROUPS, NAV_ITEMS } from "@/shared/lib/navLinks";

const _byKey = Object.fromEntries(NAV_ITEMS.map((n) => [n.key, n]));

const SEGMENT_TO_APP = { apps: "workspace" };
for (const group of NAV_GROUPS) {
  for (const key of group.items) {
    SEGMENT_TO_APP[_byKey[key].path.split("/")[0]] = group.app;
  }
}

/**
 * Returns the active app key ("projects" | "people" | "workspace") from the
 * current URL. Reactive — updates whenever the route changes. Unmapped
 * segments fall back to "workspace" (the settings/home app), never a product
 * app, so a stray route can't masquerade as another app and hide its nav.
 */
export function useActiveApp() {
  const segment = useLocation().pathname.split("/")[3];
  return SEGMENT_TO_APP[segment] ?? "workspace";
}
