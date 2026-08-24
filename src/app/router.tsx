import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router'
import { AppShell } from './layouts/AppShell'
import { PublicLayout } from './layouts/PublicLayout'
import { ClusterLayout } from './layouts/ClusterLayout'
import { ModeratorLayout } from './layouts/ModeratorLayout'
import { AdminLayout } from './layouts/AdminLayout'
import {
  RequireAuth,
  RequireGuest,
  RequireOnboarded,
  RequireActiveAccount,
  RequireCapability,
  RequireRestricted,
  RequireSessionRole,
  SessionRoleEntry,
} from './guards'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage'
import { TermsPage } from '../pages/TermsPage'
import { HomePage } from '../pages/HomePage'
import { ClustersPage } from '../pages/ClustersPage'
import { PostsFeedPage } from '../pages/posts/PostsFeedPage'
import { PostDetailPage } from '../pages/posts/PostDetailPage'
import { DiscoveryPage } from '../pages/DiscoveryPage'
import { DiscoveryModePage } from '../pages/DiscoveryModePage'
import { QueuePage } from '../pages/QueuePage'
import { ClusterCreatedPage } from '../pages/ClusterCreatedPage'
import { IntroductionsPage } from '../pages/IntroductionsPage'
import { WaitingForOthersPage } from '../pages/WaitingForOthersPage'
import { ProfilePage } from '../pages/ProfilePage'
import { NotificationsPage } from '../pages/NotificationsPage'
import { SettingsPage } from '../pages/SettingsPage'
import { RoomView } from '../pages/cluster/RoomView'
import { MembersView } from '../pages/cluster/MembersView'
import { SignalsView } from '../pages/cluster/SignalsView'
import { SignalDetailPage } from '../pages/cluster/SignalDetailPage'
import { VotesView } from '../pages/cluster/VotesView'
import { SettingsView } from '../pages/cluster/SettingsView'
import { OnboardingPage } from '../pages/onboarding/OnboardingPage'
import { SessionRolePage } from '../pages/SessionRolePage'
import { RestrictedAccountPage } from '../pages/RestrictedAccountPage'
import { AppealPage } from '../pages/AppealPage'
import { AdminAppealsPage } from '../pages/staff/AdminAppealsPage'
import { AdminAppealCasePage } from '../pages/staff/AdminAppealCasePage'
import { ModerationQueuePage } from '../pages/staff/ModerationQueuePage'
import { ModerationCasePage } from '../pages/staff/ModerationCasePage'
import { ModerationRolesPage } from '../pages/staff/ModerationRolesPage'
import { ModerationAuditPage } from '../pages/staff/ModerationAuditPage'
import { SignUpPage } from '../pages/auth/SignUpPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { VerifyEmailPage } from '../pages/auth/VerifyEmailPage'
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage'

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />

        {/* Auth */}
        <Route element={<PublicLayout />}>
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
        </Route>

        {/* Authenticated */}
        <Route element={<RequireAuth><Outlet /></RequireAuth>}>
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
              <RequireActiveAccount>
                <RequireSessionRole role="member">
                  <RequireOnboarded>
                    <AppShell />
                  </RequireOnboarded>
                </RequireSessionRole>
              </RequireActiveAccount>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/posts" element={<PostsFeedPage />} />
            <Route path="/posts/:postId" element={<PostDetailPage />} />
            <Route path="/clusters" element={<ClustersPage />} />
            <Route path="/discovery" element={<DiscoveryPage />} />
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
            <Route path="/moderator" element={<Navigate to="/moderator/reports" replace />} />
            <Route path="/moderator/reports" element={<ModerationQueuePage />} />
            <Route path="/moderator/reports/:reportId" element={<ModerationCasePage />} />
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
            <Route path="/admin" element={<Navigate to="/admin/reports" replace />} />
            <Route path="/admin/reports" element={<ModerationQueuePage />} />
            <Route path="/admin/reports/:reportId" element={<ModerationCasePage />} />
            <Route path="/admin/appeals" element={<AdminAppealsPage />} />
            <Route path="/admin/appeals/:appealId" element={<AdminAppealCasePage />} />
            <Route path="/admin/roles" element={<ModerationRolesPage />} />
            <Route path="/admin/audit" element={<ModerationAuditPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
