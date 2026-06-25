import { lazy, Suspense } from "react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Loader } from "@/shared/components/ui/Loader";

// ── Shell components — always needed, load eagerly ───────────────────────────
import ProtectedRoute from "@/shared/components/layout/ProtectedRoute";
import AppLayout from "@/shared/components/layout/AppLayout";
import WorkspaceRedirect from "@/pages/workspace/WorkspaceRedirect";

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

// ── Workspace pages ───────────────────────────────────────────────────────────
const DashboardsPage = lazy(() => import("@/pages/workspace/DashboardsPage"));
const AnalyticsPage = lazy(() => import("@/pages/workspace/AnalyticsPage"));
const GoalsPage = lazy(() => import("@/pages/workspace/GoalsPage"));
const MyWorkPage = lazy(() => import("@/pages/workspace/MyWorkPage"));
const AppLauncherPage = lazy(() => import("@/pages/workspace/AppLauncherPage"));
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
              <Route
                path="apps"
                element={<AppLauncherPage />}
                handle={{ app: "launcher" }}
              />

              {/* Boards */}
              <Route
                path="boards"
                element={<BoardsPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="boards/:boardId"
                element={<KanbanPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="boards/:boardId/wiki"
                element={<WikiPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="boards/:boardId/wiki/:pageId"
                element={<WikiPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="boards/:boardId/forms"
                element={<FormsPage />}
                handle={{ app: "projects" }}
              />

              {/* Org Structure */}
              <Route
                path="departments"
                element={<DepartmentsPage />}
                handle={{ app: "org" }}
              />
              <Route
                path="teams"
                element={<TeamsPage />}
                handle={{ app: "org" }}
              />
              <Route
                path="org-chart"
                element={<OrgChartPage />}
                handle={{ app: "org" }}
              />

              {/* HR Management */}
              <Route
                path="hr"
                element={<HRDashboardPage />}
                handle={{ app: "hr" }}
              />
              <Route
                path="hr/leave"
                element={<LeavePage />}
                handle={{ app: "hr" }}
              />
              <Route
                path="hr/attendance"
                element={<AttendancePage />}
                handle={{ app: "hr" }}
              />
              <Route
                path="members/:memberId"
                element={<MemberDetailPage />}
                handle={{ app: "hr" }}
              />

              {/* Workspace */}
              <Route
                path="dashboards"
                element={<DashboardsPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="analytics"
                element={<AnalyticsPage />}
                handle={{ app: "analytics" }}
              />
              <Route
                path="goals"
                element={<GoalsPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="my-work"
                element={<MyWorkPage />}
                handle={{ app: "projects" }}
              />
              <Route
                path="members"
                element={<MembersPage />}
                handle={{ app: "workspace" }}
              />

              {/* Settings */}
              <Route
                path="settings"
                element={<SettingsPage />}
                handle={{ app: "workspace" }}
              />
              <Route
                path="settings/integrations"
                element={<IntegrationsPage />}
                handle={{ app: "workspace" }}
              />
              <Route
                path="settings/api"
                element={<APIKeysPage />}
                handle={{ app: "workspace" }}
              />
              <Route
                path="settings/webhooks"
                element={<WebhooksPage />}
                handle={{ app: "workspace" }}
              />
              <Route
                path="import"
                element={<ImportPage />}
                handle={{ app: "projects" }}
              />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </GoogleOAuthProvider>
  );
}
