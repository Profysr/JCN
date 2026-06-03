import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import OnboardingPage from "@/pages/onboarding/OnboardingPage";
import WorkspaceRedirect from "@/pages/workspace/WorkspaceRedirect";
// import DashboardPage from "@/pages/dashboard/DashboardPage";   // v3.3.0 — inlined into DashboardsPage
import ProjectsPage from "@/pages/projects/ProjectsPage";
import KanbanPage from "@/pages/projects/KanbanPage";
import MembersPage from "@/pages/workspace/MembersPage";
import SettingsPage from "@/pages/workspace/SettingsPage";
import RoadmapPage from "@/pages/projects/RoadmapPage";
// import AnalyticsPage from "@/pages/workspace/AnalyticsPage";   // v3.3.0 — inlined into DashboardsPage
import AcceptInvitePage from "@/pages/invite/AcceptInvitePage";
import SetupWizard from "@/pages/workspace/SetupWizard";
import CommandPalette from "@/components/CommandPalette";
// v2.5.0
import WikiPage from "@/pages/projects/WikiPage";
// v2.6.0
import FormsPage from "@/pages/projects/FormsPage";
// v2.7.0
import AutomationsPage from "@/pages/projects/AutomationsPage";
// v2.8.0
import TimesheetsPage from "@/pages/workspace/TimesheetsPage";
// v2.6.0 — public form (no auth)
import PublicFormPage from "@/pages/forms/PublicFormPage";
// v3.3.0
import DashboardsPage from "@/pages/workspace/DashboardsPage";
// v3.4.0
import MyWorkPage from "@/pages/workspace/MyWorkPage";
import PortfolioPage from "@/pages/workspace/PortfolioPage";

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
        <Route path="/forms/:formToken" element={<PublicFormPage />} />

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/" element={<WorkspaceRedirect />} />
          <Route path="/w/:workspaceSlug/setup" element={<SetupWizard />} />

          <Route path="/w/:workspaceSlug" element={<AppLayout onOpenPalette={() => setPaletteOpen(true)} />}>
            {/* v3.3.0 — old home redirects to Dashboards */}
            <Route index element={<Navigate to="dashboards" replace />} />
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<KanbanPage />} />

            {/* v2.5.0 — Wiki (per project) */}
            <Route path="projects/:projectId/wiki" element={<WikiPage />} />
            <Route path="projects/:projectId/wiki/:pageId" element={<WikiPage />} />

            {/* v2.6.0 — Forms (per project) */}
            <Route path="projects/:projectId/forms" element={<FormsPage />} />

            {/* v2.7.0 — Automations (per project) */}
            <Route path="projects/:projectId/automations" element={<AutomationsPage />} />

            {/* Workspace-level */}
            <Route path="roadmap" element={<RoadmapPage />} />
            {/* v3.3.0 — Dashboards (replaces + subsumes old Dashboard + Analytics pages) */}
            <Route path="dashboards" element={<DashboardsPage />} />
            {/* Legacy redirects so old bookmarks don't break */}
            <Route path="analytics" element={<Navigate to="dashboards?tab=analytics" replace />} />
            <Route path="timesheets" element={<TimesheetsPage />} />
            <Route path="portfolio"  element={<PortfolioPage />} />
            <Route path="my-work"    element={<MyWorkPage />} />
            <Route path="members"    element={<MembersPage />} />
            <Route path="settings"   element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
