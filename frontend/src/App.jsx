import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import OnboardingPage from "@/pages/onboarding/OnboardingPage";
import WorkspaceRedirect from "@/pages/workspace/WorkspaceRedirect";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import ProjectsPage from "@/pages/projects/ProjectsPage";
import KanbanPage from "@/pages/projects/KanbanPage";
import MembersPage from "@/pages/workspace/MembersPage";
import SettingsPage from "@/pages/workspace/SettingsPage";
import RoadmapPage from "@/pages/projects/RoadmapPage";
import AnalyticsPage from "@/pages/workspace/AnalyticsPage";
import AcceptInvitePage from "@/pages/invite/AcceptInvitePage";
import CommandPalette from "@/components/CommandPalette";

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invites/:token" element={<AcceptInvitePage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/" element={<WorkspaceRedirect />} />

          <Route path="/w/:workspaceSlug" element={<AppLayout onOpenPalette={() => setPaletteOpen(true)} />}>
            <Route index element={<DashboardPage />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<KanbanPage />} />
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="members" element={<MembersPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
