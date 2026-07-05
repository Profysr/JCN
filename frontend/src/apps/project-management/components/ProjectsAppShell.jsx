import { Outlet } from "react-router-dom";
import ProjectsHeader from "@/apps/project-management/components/ProjectsHeader";
import { useProjectsShortcuts } from "@/apps/project-management/hooks/useProjectsShortcuts";

/**
 * Wraps every Project Management route (nested under <AppGuard app="projects">
 * in App.jsx). Adds the app's own header (search trigger) and keyboard
 * shortcuts on top of the shared AppLayout shell (sidebar, permissions,
 * command palette).
 */
export default function ProjectsAppShell() {
  useProjectsShortcuts();

  return (
    <div className="flex flex-col h-full min-h-0">
      <ProjectsHeader />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
