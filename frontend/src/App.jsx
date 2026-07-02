import { lazy, Suspense } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader } from "@/shared/components/ui/Loader";
import NotFoundPage from "@/pages/NotFoundPage";

// ── Shell components — always needed, load eagerly ───────────────────────────
import ProtectedRoute from "@/shared/components/layout/ProtectedRoute";
import AppLayout from "@/shared/components/layout/AppLayout";
import AppGuard from "@/shared/components/layout/PermissionRoute";
import WorkspaceRedirect from "@/pages/workspace/WorkspaceRedirect";
import OrgOnboardingGate from "@/apps/org-structure/components/OrgOnboardingGate";

// ── Public pages ──────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/auth/RegisterPage"));
const ForgotPasswordPage = lazy(
  () => import("@/pages/auth/ForgotPasswordPage"),
);
const ResetPasswordConfirmPage = lazy(
  () => import("@/pages/auth/ResetPasswordConfirmPage"),
);
const VerifyEmailSentPage = lazy(
  () => import("@/pages/auth/VerifyEmailSentPage"),
);
const EmailVerifyConfirmPage = lazy(
  () => import("@/pages/auth/EmailVerifyConfirmPage"),
);
const AcceptInvitePage = lazy(() => import("@/pages/invite/AcceptInvitePage"));
const PublicFormPage = lazy(() => import("@/pages/forms/PublicFormPage"));

// ── Onboarding / setup ────────────────────────────────────────────────────────
const OnboardingPage = lazy(() => import("@/pages/onboarding/OnboardingPage"));
const SetupWizard = lazy(() => import("@/pages/workspace/SetupWizard"));

// ── Project pages ─────────────────────────────────────────────────────────────
const BoardsPage = lazy(
  () => import("@/apps/project-management/pages/BoardsPage"),
);
const KanbanPage = lazy(
  () => import("@/apps/project-management/pages/KanbanPage"),
);
const WikiPage = lazy(() => import("@/apps/project-management/pages/WikiPage"));
const FormsPage = lazy(
  () => import("@/apps/project-management/pages/FormsPage"),
);

// ── Org Structure pages ───────────────────────────────────────────────────────
const DepartmentsPage = lazy(
  () => import("@/apps/org-structure/pages/DepartmentsPage"),
);
const TeamsPage = lazy(() => import("@/apps/org-structure/pages/TeamsPage"));
const OrgChartPage = lazy(
  () => import("@/apps/org-structure/pages/OrgChartPage"),
);
const PeopleDirectoryPage = lazy(
  () => import("@/apps/org-structure/pages/PeopleDirectoryPage"),
);
const PendingProfilesPage = lazy(
  () => import("@/apps/org-structure/pages/PendingProfilesPage"),
);
const JobTitlesPage = lazy(
  () => import("@/apps/org-structure/pages/JobTitlesPage"),
);
const MemberProfilePage = lazy(
  () => import("@/apps/org-structure/pages/MemberProfilePage"),
);

// ── HR Management pages ───────────────────────────────────────────────────────
const HRDashboardPage = lazy(
  () => import("@/apps/hr-management/pages/HRDashboardPage"),
);
const LeavePage = lazy(() => import("@/apps/hr-management/pages/LeavePage"));
const AttendancePage = lazy(
  () => import("@/apps/hr-management/pages/AttendancePage"),
);
const MemberDetailPage = lazy(
  () => import("@/apps/hr-management/pages/MemberDetailPage"),
);

// ── Project Management — workspace-level pages ────────────────────────────────
const DashboardsPage = lazy(
  () => import("@/apps/project-management/pages/DashboardsPage"),
);
const AnalyticsPage = lazy(
  () => import("@/apps/project-management/pages/AnalyticsPage"),
);
const GoalsPage = lazy(
  () => import("@/apps/project-management/pages/GoalsPage"),
);
const MyWorkPage = lazy(
  () => import("@/apps/project-management/pages/MyWorkPage"),
);

// ── Workspace pages ───────────────────────────────────────────────────────────
const AppLauncherPage = lazy(() => import("@/pages/workspace/AppLauncherPage"));
const MembersPage = lazy(() => import("@/pages/workspace/MembersPage"));
const SettingsPage = lazy(() => import("@/pages/workspace/SettingsPage"));

// ── Project Management — import ───────────────────────────────────────────────
const ImportPage = lazy(
  () => import("@/apps/project-management/pages/ImportPage"),
);

// ── Workspace — settings & developer pages ────────────────────────────────────
const IntegrationsPage = lazy(
  () => import("@/pages/workspace/IntegrationsPage"),
);
const APIKeysPage = lazy(() => import("@/pages/workspace/APIKeysPage"));
const WebhooksPage = lazy(() => import("@/pages/workspace/WebhooksPage"));

// ── Fallback UIs ──────────────────────────────────────────────────────────────

function FullPageLoader() {
  return <Loader size="lg" className="min-h-screen bg-background" />;
}

function ContentLoader() {
  return <Loader className="h-screen" />;
}

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
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
      <Routes>
        {/* Public — full-page suspense */}
        <Route element={<FullPageSuspense />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/reset-password/:uid/:token"
            element={<ResetPasswordConfirmPage />}
          />
          <Route path="/verify-email" element={<VerifyEmailSentPage />} />
          <Route
            path="/verify-email/:key"
            element={<EmailVerifyConfirmPage />}
          />
          <Route path="/invites/:token" element={<AcceptInvitePage />} />
          <Route path="/forms/:formToken" element={<PublicFormPage />} />
        </Route>

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route element={<FullPageSuspense />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/w/:workspaceId/setup" element={<SetupWizard />} />
            <Route path="/" element={<WorkspaceRedirect />} />
          </Route>

          {/* AppLayout shell loads eagerly; page content lazy-loads inside SuspenseOutlet */}
          <Route path="/w/:workspaceId" element={<AppLayout />}>
            <Route element={<SuspenseOutlet />}>
              <Route index element={<Navigate to="apps" replace />} />
              <Route path="apps" element={<AppLauncherPage />} />

              {/* ── Project Management ──────────────────────────────────── */}
              <Route element={<AppGuard app="projects" />}>
                <Route path="boards" element={<BoardsPage />} />
                <Route path="boards/:boardId" element={<KanbanPage />} />
                <Route path="boards/:boardId/wiki" element={<WikiPage />} />
                <Route path="boards/:boardId/wiki/:pageId" element={<WikiPage />} />
                <Route path="boards/:boardId/forms" element={<FormsPage />} />
                <Route path="dashboards" element={<DashboardsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="goals" element={<GoalsPage />} />
                <Route path="my-work" element={<MyWorkPage />} />
                <Route path="import" element={<ImportPage />} />
              </Route>

              {/* ── Org Structure ───────────────────────────────────────── */}
              <Route element={<AppGuard app="org" />}>
                <Route element={<OrgOnboardingGate />}>
                  <Route path="departments" element={<DepartmentsPage />} />
                  <Route path="teams" element={<TeamsPage />} />
                  <Route path="org-chart" element={<OrgChartPage />} />
                  <Route path="people" element={<PeopleDirectoryPage />} />
                  <Route path="people/:memberId" element={<MemberProfilePage />} />
                  <Route path="org/pending" element={<PendingProfilesPage />} />
                  <Route path="org/job-titles" element={<JobTitlesPage />} />
                </Route>
              </Route>

              {/* ── HR Management ───────────────────────────────────────── */}
              <Route element={<AppGuard app="hr" />}>
                <Route path="hr" element={<HRDashboardPage />} />
                <Route path="hr/leave" element={<LeavePage />} />
                <Route path="hr/attendance" element={<AttendancePage />} />
                <Route path="members/:memberId" element={<MemberDetailPage />} />
              </Route>

              {/* ── Workspace & Settings ────────────────────────────────── */}
              <Route element={<AppGuard />}>
                <Route path="members" element={<MembersPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="settings/integrations" element={<IntegrationsPage />} />
                <Route path="settings/api" element={<APIKeysPage />} />
                <Route path="settings/webhooks" element={<WebhooksPage />} />
              </Route>
            </Route>
          </Route>
        </Route>

        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" replace />} />
      </Routes>
    </GoogleOAuthProvider>
  );
}
