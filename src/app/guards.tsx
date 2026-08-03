import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './auth-context'
import { useProfile } from '../lib/use-profile'

function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-lowest p-8 text-center shadow-soft">
        <h1 className="font-brand text-2xl tracking-[0.15em] text-on-surface">Sensorium</h1>
        <p className="mt-4 text-sm leading-6 text-on-surface-variant">
          Supabase is not configured yet. Copy <code>.env.example</code> to{' '}
          <code>.env</code> and set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </p>
      </div>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

/** Blocks unauthenticated access. Shows setup/loading states before redirecting. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.state === 'unconfigured') return <SetupNotice />
  if (auth.state === 'loading') return <LoadingScreen />
  if (auth.state === 'signedOut') return <Navigate to="/auth/login" replace />
  return <>{children}</>
}

/** Blocks signed-in users from guest-only pages (signup/login). */
export function RequireGuest({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.state === 'unconfigured') return <SetupNotice />
  if (auth.state === 'loading') return <LoadingScreen />
  if (auth.state === 'signedIn') return <Navigate to="/home" replace />
  return <>{children}</>
}

/**
 * Blocks access to post-onboarding routes until the user has completed
 * onboarding (`profiles.onboarding_completed_at` set). Redirects to /onboarding.
 */
export function RequireOnboarded({ children }: { children: ReactNode }) {
  const profile = useProfile()

  if (profile.isLoading) return <LoadingScreen />

  // No profile row yet (e.g. signup before the row-trigger, or new account):
  // treat as not onboarded and send to onboarding, which bootstraps the profile.
  if (!profile.isError && !profile.data) return <Navigate to="/onboarding" replace />

  if (profile.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-2xl bg-surface-lowest p-8 text-center shadow-soft">
          <h1 className="text-xl font-semibold text-on-surface">Couldn’t load your profile</h1>
          <p className="mt-3 text-sm leading-6 text-on-surface-variant">
            Something went wrong while checking your account. Please try again.
          </p>
          <button
            type="button"
            onClick={() => profile.refetch()}
            className="mt-6 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  const completedOnboarding = profile.data?.onboarding_completed_at != null
  if (!completedOnboarding) {
    return <Navigate to="/onboarding" replace />
  }

  return <>{children}</>
}
