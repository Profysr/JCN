import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import ProjectsHeader from "@/apps/project-management/components/ProjectsHeader";
import { useProjectsShortcuts } from "@/apps/project-management/hooks/useProjectsShortcuts";

const CommandPalette = lazy(
  () => import("@/apps/project-management/components/CommandPalette"),
);

/**
 * Wraps every Project Management route (nested under <AppGuard app="projects">
 * in App.jsx). Adds the app's own header (search trigger), keyboard shortcuts,
 * and command palette on top of the shared AppLayout shell (sidebar,
 * permissions).
 *
 * The command palette lives here, not in the shared shell — it searches
 * boards/tasks and offers PM quick actions, so it's a Projects feature. It only
 * mounts while a Projects route is active. Both the header button and the ⌘K
 * shortcut (useProjectsShortcuts) open it via the "jcn:open-palette" event.
 */
export default function ProjectsAppShell() {
  const { workspaceId } = useParams();
  useProjectsShortcuts();

  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = () => setPaletteOpen(true);
    window.addEventListener("jcn:open-palette", handler);
    return () => window.removeEventListener("jcn:open-palette", handler);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <ProjectsHeader />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>

      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  );
}
