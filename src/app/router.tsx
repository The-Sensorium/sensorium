import { BrowserRouter, Outlet, Route, Routes } from 'react-router'
import { AppShell } from './layouts/AppShell'
import { PublicLayout } from './layouts/PublicLayout'
import { ClusterLayout } from './layouts/ClusterLayout'
import { RequireAuth, RequireGuest, RequireOnboarded } from './guards'
import { LandingPage } from '../pages/LandingPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PrivacyPolicyPage } from '../pages/PrivacyPolicyPage'
import { TermsPage } from '../pages/TermsPage'
import { HomePage } from '../pages/HomePage'
import { ClustersPage } from '../pages/ClustersPage'
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
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<RequireOnboarded><AppShell /></RequireOnboarded>}>
            <Route path="/home" element={<HomePage />} />
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
        </Route>

        {/* Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
