import { useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { useModules } from "@/shared/hooks/useModules";
import { Loader } from "@/shared/components/ui/Loader";
import ModuleUnavailablePage from "@/pages/errors/ModuleUnavailablePage";
import AppWelcomeScreen from "@/shared/components/layout/AppWelcomeScreen";

/**
 * Route-level module gate. Wrap any set of routes with this to prevent access
 * when the workspace hasn't enabled the required module.
 *
 * On first visit after a module is enabled, shows the App Welcome Screen
 * (vE.4 Step 1). The "seen" flag is persisted in localStorage so the screen
 * only appears once per workspace per module.
 *
 * Usage in App.jsx:
 *   <Route element={<ProtectedModuleRoute moduleKey="org_structure" />}>
 *     <Route path="departments" element={<DepartmentsPage />} />
 *   </Route>
 */
export default function ProtectedModuleRoute({ moduleKey }) {
  const { workspaceId } = useParams();
  const { isEnabled, isLoading } = useModules();

  const storageKey = `jcn_app_welcomed_${workspaceId}_${moduleKey}`;
  const [welcomed, setWelcomed] = useState(
    () => !!localStorage.getItem(storageKey),
  );

  if (isLoading) return <Loader className="h-screen" />;
  if (!isEnabled(moduleKey)) return <ModuleUnavailablePage moduleKey={moduleKey} />;

  if (!welcomed) {
    return (
      <AppWelcomeScreen
        moduleKey={moduleKey}
        onGetStarted={() => {
          localStorage.setItem(storageKey, "1");
          setWelcomed(true);
        }}
      />
    );
  }

  return <Outlet />;
}
