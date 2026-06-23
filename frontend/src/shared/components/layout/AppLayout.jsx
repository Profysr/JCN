import { lazy, Suspense, useEffect, useState } from "react";
import { Outlet, useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";
import { useWorkspace } from "@/shared/hooks/useWorkspace";
import { useAnnouncePresence } from "@/shared/hooks/usePresence";
import { ModulesContext, useModulesQuery } from "@/shared/hooks/useModules";
import { PermissionsProvider } from "@/contexts/PermissionsContext";
import { useWorkspaceSocket } from "@/shared/hooks/useWorkspaceSocket";
import { useKeyboardShortcuts } from "@/shared/hooks/useKeyboardShortcuts";
import Sidebar from "@/shared/components/layout/Sidebar";

// Only rendered on interaction — load their bundles on first open, not at app start
const CommandPalette = lazy(() => import("@/shared/components/CommandPalette"));
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
  // badge, goals, and presence stay live without per-query polling. Board/task
  // events use a separate board-scoped connection (useBoardSocket in KanbanPage).
  useWorkspaceSocket(workspaceId);

  const { data: modulesData, isLoading: modulesLoading } = useModulesQuery(workspaceId);
  const modulesCtx = {
    isLoading: modulesLoading,
    modules: modulesData ?? [],
    isEnabled: (key) =>
      Array.isArray(modulesData) && modulesData.some((m) => m.key === key && m.is_enabled),
  };

  useEffect(() => {
    if (!user) return;
    hydrateTheme(user);
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // v3.5.0 — announce workspace-level presence so other users see us as online
  // useAnnouncePresence(workspaceId, "board", workspaceId);

  // v3.9.0 — command palette + shortcut overlay + user settings modal
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("me");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  useKeyboardShortcuts({
    onOpenPalette: () => setPaletteOpen((o) => !o),
    onOpenShortcuts: () => setShortcutsOpen((o) => !o),
    onToggleSidebar: () => setSidebarCollapsed((v) => !v),
    // Dispatch a custom event; KanbanPage (and other pages) can listen
    onCreateTask: () => {
      window.dispatchEvent(new CustomEvent("jcn:create-task"));
    },
    onOpenFilter: () => {
      window.dispatchEvent(new CustomEvent("jcn:focus-filter"));
    },
  });

  return (
    <PermissionsProvider workspaceId={workspaceId}>
    <ModulesContext.Provider value={modulesCtx}>
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        workspace={workspace}
        workspaceId={workspaceId}
        user={user}
        isFocusMode={isFocusMode}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        onOpenPalette={() => setPaletteOpen(true)}
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

      {/* v3.9.0 — global overlays owned here (lazy — chunk downloads on first open) */}
      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          workspaceId={workspaceId}
        />
      </Suspense>
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
    </div>
    </ModulesContext.Provider>
    </PermissionsProvider>
  );
}
