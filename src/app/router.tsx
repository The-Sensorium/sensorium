import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { Loader2 } from 'lucide-react'
import { RoutePending } from '../components/RoutePending'
import { AppShell } from './layouts/AppShell'
import { PublicLayout } from './layouts/PublicLayout'
import { ClusterLayout } from './layouts/ClusterLayout'
import { ModeratorLayout } from './layouts/ModeratorLayout'
import { AdminLayout } from './layouts/AdminLayout'
import {
  RequireAuth,
  RequireGuest,
  RequireActiveAccount,
  RequireCapability,
  RequireRestricted,
  RequireSessionRole,
  RequireMemberShell,
  SessionRoleEntry,
} from './guards'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage'
import { TermsPage } from '../pages/TermsPage'

// Route code-splitting: every page behind auth (and the auth pages themselves)
// loads on demand, so the first paint only ships the landing shell. The public
// trio above stays eager. Each lazy page suspends inside an ancestor Suspense
// (PublicLayout group, RequireAuth group, or its own wrapper), never at the
// leaf, so adding a route only means adding one lazy() line + one Route.
const HomePage = lazy(() => import('../pages/HomePage').then((m) => ({ default: m.HomePage })))
const ClustersPage = lazy(() => import('../pages/ClustersPage').then((m) => ({ default: m.ClustersPage })))
const PostsFeedPage = lazy(() => import('../pages/posts/PostsFeedPage').then((m) => ({ default: m.PostsFeedPage })))
const PostDetailPage = lazy(() => import('../pages/posts/PostDetailPage').then((m) => ({ default: m.PostDetailPage })))
const DiscoveryModePage = lazy(() => import('../pages/DiscoveryModePage').then((m) => ({ default: m.DiscoveryModePage })))
const QueuePage = lazy(() => import('../pages/QueuePage').then((m) => ({ default: m.QueuePage })))
const ClusterCreatedPage = lazy(() => import('../pages/ClusterCreatedPage').then((m) => ({ default: m.ClusterCreatedPage })))
const IntroductionsPage = lazy(() => import('../pages/IntroductionsPage').then((m) => ({ default: m.IntroductionsPage })))
const WaitingForOthersPage = lazy(() => import('../pages/WaitingForOthersPage').then((m) => ({ default: m.WaitingForOthersPage })))
const ProfilePage = lazy(() => import('../pages/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const MyReportsPage = lazy(() => import('../pages/settings/MyReportsPage').then((m) => ({ default: m.MyReportsPage })))
const RoomView = lazy(() => import('../pages/cluster/RoomView').then((m) => ({ default: m.RoomView })))
const MembersView = lazy(() => import('../pages/cluster/MembersView').then((m) => ({ default: m.MembersView })))
const SignalsView = lazy(() => import('../pages/cluster/SignalsView').then((m) => ({ default: m.SignalsView })))
const SignalDetailPage = lazy(() => import('../pages/cluster/SignalDetailPage').then((m) => ({ default: m.SignalDetailPage })))
const VotesView = lazy(() => import('../pages/cluster/VotesView').then((m) => ({ default: m.VotesView })))
const SettingsView = lazy(() => import('../pages/cluster/SettingsView').then((m) => ({ default: m.SettingsView })))
const OnboardingPage = lazy(() => import('../pages/onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })))
const SessionRolePage = lazy(() => import('../pages/SessionRolePage').then((m) => ({ default: m.SessionRolePage })))
const RestrictedAccountPage = lazy(() => import('../pages/RestrictedAccountPage').then((m) => ({ default: m.RestrictedAccountPage })))
const AppealPage = lazy(() => import('../pages/AppealPage').then((m) => ({ default: m.AppealPage })))
const AdminAppealsPage = lazy(() => import('../pages/staff/AdminAppealsPage').then((m) => ({ default: m.AdminAppealsPage })))
const AdminAppealCasePage = lazy(() => import('../pages/staff/AdminAppealCasePage').then((m) => ({ default: m.AdminAppealCasePage })))
const StaffDashboardPage = lazy(() => import('../pages/staff/StaffDashboardPage').then((m) => ({ default: m.StaffDashboardPage })))
const StaffAccountsPage = lazy(() => import('../pages/staff/StaffAccountsPage').then((m) => ({ default: m.StaffAccountsPage })))
const AccountDetailPage = lazy(() => import('../pages/staff/AccountDetailPage').then((m) => ({ default: m.AccountDetailPage })))
const ModerationQueuePage = lazy(() => import('../pages/staff/ModerationQueuePage').then((m) => ({ default: m.ModerationQueuePage })))
const ModerationCasePage = lazy(() => import('../pages/staff/ModerationCasePage').then((m) => ({ default: m.ModerationCasePage })))
const ModerationRolesPage = lazy(() => import('../pages/staff/ModerationRolesPage').then((m) => ({ default: m.ModerationRolesPage })))
const ModerationAuditPage = lazy(() => import('../pages/staff/ModerationAuditPage').then((m) => ({ default: m.ModerationAuditPage })))
const MetricsPage = lazy(() => import('../pages/staff/MetricsPage').then((m) => ({ default: m.MetricsPage })))
const SignUpPage = lazy(() => import('../pages/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })))
const VerifyEmailPage = lazy(() => import('../pages/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })))
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })))
const MobileChallengePage = lazy(() => import('../pages/auth/MobileChallengePage').then((m) => ({ default: m.MobileChallengePage })))
const MfaSetupPage = lazy(() => import('../pages/MfaSetupPage').then((m) => ({ default: m.MfaSetupPage })))
const MfaVerifyPage = lazy(() => import('../pages/MfaVerifyPage').then((m) => ({ default: m.MfaVerifyPage })))

function PageFallback() {
  return (
    <div className="grid min-h-[50dvh] place-items-center" role="status" aria-label="Loading page">
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
    </div>
  )
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        {/* Challenge solver for the native app WebView (no session, no layout chrome) */}
        <Route
          path="/auth/mobile-challenge"
          element={
            <Suspense fallback={<PageFallback />}>
              <MobileChallengePage />
            </Suspense>
          }
        />

        {/* Auth */}
        <Route
          element={
            <Suspense fallback={<PageFallback />}>
              <PublicLayout />
            </Suspense>
          }
        >
          <Route
            path="/auth/signup"
            element={
              <RequireGuest>
                <SignUpPage />
              </RequireGuest>
            }
          />
          <Route
            path="/auth/login"
            element={
              <RequireGuest>
                <LoginPage />
              </RequireGuest>
            }
          />
          <Route
            path="/auth/verify-email"
            element={
              <RequireGuest>
                <VerifyEmailPage />
              </RequireGuest>
            }
          />
          <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
          {/* Staff two-step setup/verify share the public auth chrome (logo, theme toggle). */}
          <Route
            path="/mfa-setup"
            element={
              <RequireAuth>
                <RequireActiveAccount>
                  <MfaSetupPage />
                </RequireActiveAccount>
              </RequireAuth>
            }
          />
          <Route
            path="/mfa-verify"
            element={
              <RequireAuth>
                <RequireActiveAccount>
                  <MfaVerifyPage />
                </RequireActiveAccount>
              </RequireAuth>
            }
          />
        </Route>

        {/* Authenticated */}
        <Route
          element={
            <RequireAuth>
              {/* Outer fallback covers shell-less routes (/entry, /onboarding,
                  /select-role). Shells below add their own inner Suspense so
                  nav chrome stays mounted during lazy transitions. */}
              <Suspense fallback={<RoutePending />}>
                <Outlet />
              </Suspense>
            </RequireAuth>
          }
        >
          <Route path="/entry" element={<SessionRoleEntry />} />
          <Route
            path="/select-role"
            element={
              <RequireActiveAccount>
                <SessionRolePage />
              </RequireActiveAccount>
            }
          />
          <Route path="/restricted" element={<RestrictedAccountPage />} />
          <Route
            path="/appeal"
            element={
              <RequireRestricted>
                <AppealPage />
              </RequireRestricted>
            }
          />
          <Route path="/onboarding" element={<OnboardingPage />} />

          {/* Member shell */}
          <Route
            element={
              <RequireMemberShell>
                <AppShell />
              </RequireMemberShell>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/posts" element={<PostsFeedPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/clusters" element={<ClustersPage />} />
            <Route path="/discovery" element={<Navigate to="/clusters" replace />} />
            <Route path="/discovery/:modeId" element={<DiscoveryModePage />} />
            <Route path="/queue/:queueId" element={<QueuePage />} />
            <Route path="/cluster-created" element={<ClusterCreatedPage />} />
            <Route path="/cluster/:clusterId" element={<ClusterLayout />}>
              <Route index element={<RoomView />} />
              <Route path="members" element={<MembersView />} />
              <Route path="signals" element={<SignalsView />} />
              <Route path="signals/:signalId" element={<SignalDetailPage />} />
              <Route path="votes" element={<VotesView />} />
              <Route path="settings" element={<SettingsView />} />
            </Route>
            <Route path="/cluster/:clusterId/introductions" element={<IntroductionsPage />} />
            <Route path="/cluster/:clusterId/waiting" element={<WaitingForOthersPage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/reports" element={<MyReportsPage />} />
          </Route>

          {/* Moderator shell */}
          <Route
            element={
              <RequireActiveAccount>
                <RequireSessionRole role="moderator">
                  <RequireCapability capability="can_moderate">
                    <ModeratorLayout />
                  </RequireCapability>
                </RequireSessionRole>
              </RequireActiveAccount>
            }
          >
            <Route path="/moderator" element={<StaffDashboardPage />} />
            <Route path="/moderator/reports" element={<ModerationQueuePage />} />
            <Route path="/moderator/reports/:reportId" element={<ModerationCasePage />} />
            <Route path="/moderator/accounts" element={<StaffAccountsPage />} />
            <Route path="/moderator/accounts/:userId" element={<AccountDetailPage />} />
          </Route>

          {/* Admin shell */}
          <Route
            element={
              <RequireActiveAccount>
                <RequireSessionRole role="admin">
                  <RequireCapability capability="can_manage_roles">
                    <AdminLayout />
                  </RequireCapability>
                </RequireSessionRole>
              </RequireActiveAccount>
            }
          >
            <Route path="/admin" element={<StaffDashboardPage />} />
            <Route path="/admin/reports" element={<ModerationQueuePage />} />
            <Route path="/admin/reports/:reportId" element={<ModerationCasePage />} />
            <Route path="/admin/appeals" element={<AdminAppealsPage />} />
            <Route path="/admin/appeals/:appealId" element={<AdminAppealCasePage />} />
            <Route path="/admin/accounts" element={<StaffAccountsPage />} />
            <Route path="/admin/accounts/:userId" element={<AccountDetailPage />} />
            <Route path="/admin/roles" element={<ModerationRolesPage />} />
            <Route path="/admin/audit" element={<ModerationAuditPage />} />
            <Route path="/admin/metrics" element={<MetricsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
