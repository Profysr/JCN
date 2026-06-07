import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader } from "@/components/ui/Loader";

// ── Shell components — always needed, load eagerly ───────────────────────────
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import WorkspaceRedirect from "@/pages/workspace/WorkspaceRedirect";

// ── Public pages ──────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const AcceptInvitePage = lazy(() => import("@/pages/invite/AcceptInvitePage"));
const PublicFormPage = lazy(() => import("@/pages/forms/PublicFormPage"));

// ── Onboarding / setup ────────────────────────────────────────────────────────
const OnboardingPage = lazy(() => import("@/pages/onboarding/OnboardingPage"));
const SetupWizard = lazy(() => import("@/pages/workspace/SetupWizard"));

// ── Project pages ─────────────────────────────────────────────────────────────
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage"));
const KanbanPage = lazy(() => import("@/pages/projects/KanbanPage"));
const RoadmapPage = lazy(() => import("@/pages/projects/RoadmapPage"));
const WikiPage = lazy(() => import("@/pages/projects/WikiPage"));
const FormsPage = lazy(() => import("@/pages/projects/FormsPage"));
const AutomationsPage = lazy(() => import("@/pages/projects/AutomationsPage"));

// ── Workspace pages ───────────────────────────────────────────────────────────
const DashboardsPage = lazy(() => import("@/pages/workspace/DashboardsPage"));
const AnalyticsPage = lazy(() => import("@/pages/workspace/AnalyticsPage"));
const ReportsPage = lazy(() => import("@/pages/workspace/ReportsPage"));
const TimesheetsPage = lazy(() => import("@/pages/workspace/TimesheetsPage"));
const PortfolioPage = lazy(() => import("@/pages/workspace/PortfolioPage"));
const InboxPage = lazy(() => import("@/pages/workspace/InboxPage"));
const GoalsPage = lazy(() => import("@/pages/workspace/GoalsPage"));
const MyWorkPage = lazy(() => import("@/pages/workspace/MyWorkPage"));
const MembersPage = lazy(() => import("@/pages/workspace/MembersPage"));
const SettingsPage = lazy(() => import("@/pages/workspace/SettingsPage"));

// ── Settings / developer pages ────────────────────────────────────────────────
const IntegrationsPage = lazy(
  () => import("@/pages/workspace/IntegrationsPage"),
);
const APIKeysPage = lazy(() => import("@/pages/workspace/APIKeysPage"));
const WebhooksPage = lazy(() => import("@/pages/workspace/WebhooksPage"));
const ImportPage = lazy(() => import("@/pages/workspace/ImportPage"));

// ── Fallback UIs ──────────────────────────────────────────────────────────────

/** Used for full-screen public/auth routes. */
function FullPageLoader() {
  return <Loader size="lg" className="min-h-screen bg-background" />;
}

/** Used inside AppLayout — only the content area suspends, sidebar stays visible. */
function ContentLoader() {
  return <Loader className="h-screen" />;
}

/**
 * Layout route that wraps all workspace children with a Suspense boundary.
 * AppLayout renders instantly; only the outlet content shows the fallback.
 */
function FullPageSuspense() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Outlet />
    </Suspense>
  );
}

function SuspenseOutlet() {
  return (
    <Suspense fallback={<ContentLoader />}>
      <Outlet />
    </Suspense>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Public — full-page suspense */}
      <Route element={<FullPageSuspense />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/invites/:token" element={<AcceptInvitePage />} />
        <Route path="/forms/:formToken" element={<PublicFormPage />} />
      </Route>

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<FullPageSuspense />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/w/:workspaceSlug/setup" element={<SetupWizard />} />
          <Route path="/" element={<WorkspaceRedirect />} />
        </Route>

        {/* AppLayout shell loads eagerly; page content lazy-loads inside SuspenseOutlet */}
        <Route path="/w/:workspaceSlug" element={<AppLayout />}>
          <Route element={<SuspenseOutlet />}>
            <Route index element={<Navigate to="dashboards" replace />} />

            {/* Projects */}
            <Route path="projects" element={<ProjectsPage />} />
            <Route path="projects/:projectId" element={<KanbanPage />} />
            <Route path="projects/:projectId/wiki" element={<WikiPage />} />
            <Route
              path="projects/:projectId/wiki/:pageId"
              element={<WikiPage />}
            />
            <Route path="projects/:projectId/forms" element={<FormsPage />} />
            <Route
              path="projects/:projectId/automations"
              element={<AutomationsPage />}
            />

            {/* Workspace */}
            <Route path="roadmap" element={<RoadmapPage />} />
            <Route path="dashboards" element={<DashboardsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="timesheets" element={<TimesheetsPage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="goals" element={<GoalsPage />} />
            <Route path="my-work" element={<MyWorkPage />} />
            <Route path="members" element={<MembersPage />} />

            {/* Settings */}
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="settings/integrations"
              element={<IntegrationsPage />}
            />
            <Route path="settings/api" element={<APIKeysPage />} />
            <Route path="settings/webhooks" element={<WebhooksPage />} />
            <Route path="settings/import" element={<ImportPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
