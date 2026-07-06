import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { useWorkspaceSocket } from "@/shared/hooks/useWorkspaceSocket";
import { useWorkspaceShortcuts } from "@/shared/hooks/useWorkspaceShortcuts";
import Sidebar from "@/shared/components/layout/Sidebar";
import { TourProvider } from "@/shared/onboarding/tour/TourProvider";
const WelcomeModal = lazy(
  () => import("@/shared/onboarding/tour/WelcomeModal"),
);
const ShortcutOverlay = lazy(
  () => import("@/shared/components/ShortcutOverlay"),
);
const UserSettingsModal = lazy(
  () => import("@/shared/components/UserSettingsModal"),
);

export default function AppLayout() {
  const { workspaceId } = useParams();
  const { user, logout } = useAuthStore();
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace(workspaceId);

  // Workspace-wide realtime — one connection alive on every page so the inbox
  // badge, goals, and presence stay live without per-query polling.
  useWorkspaceSocket(workspaceId);

  useEffect(() => {
    if (!user) return;
    hydrateTheme(user);
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("me");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Focus Mode
  const [focusModeUntil, setFocusModeUntil] = useState(() => {
    const stored = localStorage.getItem("jcn_focus_until");
    return stored ? parseInt(stored, 10) : null;
  });
  const isFocusMode = focusModeUntil && Date.now() < focusModeUntil;

  const enableFocusMode = (hours) => {
    const until = Date.now() + hours * 3_600_000;
    setFocusModeUntil(until);
    localStorage.setItem("jcn_focus_until", String(until));
  };
  const disableFocusMode = () => {
    setFocusModeUntil(null);
    localStorage.removeItem("jcn_focus_until");
  };

  useWorkspaceShortcuts({
    onOpenShortcuts: () => setShortcutsOpen((o) => !o),
    onToggleSidebar: () => setSidebarCollapsed((v) => !v),
    onOpenPermissions: () => {
      window.dispatchEvent(new CustomEvent("jcn:open-permissions"));
    },
    onOpenProfile: () => {
      window.dispatchEvent(new CustomEvent("jcn:open-profile"));
    },
    onOpenSettings: () => {
      setSettingsTab("me");
      setSettingsOpen(true);
    },
  });

  return (
    <PermissionsProvider workspaceId={workspaceId}>
      <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          workspace={workspace}
          workspaceId={workspaceId}
          user={user}
          isFocusMode={isFocusMode}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          onOpenSettings={(tab) => {
            setSettingsTab(tab);
            setSettingsOpen(true);
          }}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          onEnableFocus={enableFocusMode}
          onDisableFocus={disableFocusMode}
          onLogout={handleLogout}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>

        <Suspense fallback={null}>
          {shortcutsOpen && (
            <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />
          )}
        </Suspense>
        <Suspense fallback={null}>
          {settingsOpen && (
            <UserSettingsModal
              defaultTab={settingsTab}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </Suspense>

        <Suspense fallback={null}>
          <WelcomeModal />
        </Suspense>
      </div>
      </TourProvider>
    </PermissionsProvider>
  );
}
