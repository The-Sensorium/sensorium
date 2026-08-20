import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from './auth-context'
import { useProfile } from '../lib/use-profile'
import {
  activeSessionRoles,
  hasCapability,
  useMyAccess,
  sessionRoleShell,
  type Capability,
  type MyAccessRow,
  type SessionRole,
} from '../features/access'
import { useSessionRole } from './session-role-context'
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

function AccessErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl bg-surface-lowest p-8 text-center shadow-soft">
        <h1 className="text-xl font-semibold text-on-surface">Couldn’t load your account</h1>
        <p className="mt-3 text-sm leading-6 text-on-surface-variant">
          Something went wrong while checking your account status. Your access is not granted until this loads.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-pill bg-primary px-6 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
        >
          Try Again
        </button>
      </div>
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

/** Blocks signed-in users from guest-only pages (signup/login). Signed-in users
 * go through the session-role resolver, which bypasses /select-role for
 * single-role accounts. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const auth = useAuth()

  if (auth.state === 'unconfigured') return <SetupNotice />
  if (auth.state === 'loading') return <LoadingScreen />
  if (auth.state === 'signedIn') return <Navigate to="/entry" replace />
  return <>{children}</>
}

/**
 * Blocks access to the signed-in app shells until the account status resolves.
 * Suspended/banned accounts get the restricted-account screen, not the app.
 */
export function RequireActiveAccount({ children }: { children: ReactNode }) {
  const access = useMyAccess()

  if (access.isLoading) return <LoadingScreen />
  if (access.isError || !access.data) return <AccessErrorScreen onRetry={() => void access.refetch()} />
  if (access.data.account_status !== 'active') return <Navigate to="/restricted" replace />
  return <>{children}</>
}

/**
 * Fail-closed gate for staff routes. A revoked staff member loses UI access
 * after the access query refreshes, but the real protection is the database.
 */
export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  const access = useMyAccess()

  if (access.isLoading) return <LoadingScreen />
  if (access.isError || !access.data) return <AccessErrorScreen onRetry={() => void access.refetch()} />
  if (access.data.account_status !== 'active') return <Navigate to="/restricted" replace />
  if (!hasCapability(access.data, capability)) return <Navigate to="/select-role" replace />
  return <>{children}</>
}

/**
 * Picks the correct UI shell for a route. A direct visit with no selected role
 * resolves automatically for single-role accounts; a wrong mode is sent back
 * to /select-role rather than silently switching.
 */
export function RequireSessionRole({ role, children }: { role: SessionRole; children: ReactNode }) {
  const access = useMyAccess()

  if (access.isLoading) return <LoadingScreen />
  if (access.isError || !access.data) return <AccessErrorScreen onRetry={() => void access.refetch()} />
  if (access.data.account_status !== 'active') return <Navigate to="/restricted" replace />
  return (
    <SessionRoleGate access={access.data} role={role}>
      {children}
    </SessionRoleGate>
  )
}

function SessionRoleGate({ access, role, children }: { access: MyAccessRow; role: SessionRole; children: ReactNode }) {
  const { role: current, setRole } = useSessionRole()

  const available = activeSessionRoles(access)
  const autoResolve = current === null && available.length === 1 && available[0] === role

  // Adopt the single available role in an effect so we never mutate the
  // provider's state while a sibling component is rendering.
  useEffect(() => {
    if (autoResolve) setRole(available[0])
  }, [autoResolve, available, setRole])

  if (autoResolve) return <>{children}</>
  if (current === null && available.length === 1 && available[0] !== role) {
    return <Navigate to="/entry" replace />
  }
  if (current === role) return <>{children}</>
  return <Navigate to="/select-role" replace />
}

/** Resolves the post-login shell: single-role accounts bypass the picker. */
export function SessionRoleEntry() {
  const access = useMyAccess()

  if (access.isLoading) return <LoadingScreen />
  if (access.isError || !access.data) return <AccessErrorScreen onRetry={() => void access.refetch()} />
  if (access.data.account_status !== 'active') return <Navigate to="/restricted" replace />
  return <SessionRoleResolver access={access.data} />
}

function SessionRoleResolver({ access }: { access: MyAccessRow }) {
  const { setRole } = useSessionRole()

  const available = activeSessionRoles(access)
  const single = available.length === 1

  useEffect(() => {
    if (single && available.length === 1) setRole(available[0])
  }, [available, setRole, single])

  if (!single) return <Navigate to="/select-role" replace />
  return <Navigate to={sessionRoleShell(available[0])} replace />
}

/**
 * Blocks active/signed-out accounts from the appeal page. Only restricted
 * accounts (suspended or banned) belong here; everyone else bounces to /home.
 */
export function RequireRestricted({ children }: { children: ReactNode }) {
  const access = useMyAccess()

  if (access.isLoading) return <LoadingScreen />
  if (access.isError || !access.data) return <AccessErrorScreen onRetry={() => void access.refetch()} />
  if (access.data.account_status === 'active') return <Navigate to="/home" replace />
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
