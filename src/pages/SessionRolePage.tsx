import { Link, useNavigate } from 'react-router'
import { ArrowRight, ArrowUpRight, Check, Loader2, Shield, ShieldCheck, User } from 'lucide-react'
import { useDocumentTitle } from '../lib/use-document-title'
import { useAuth } from '../app/auth-context'
import { useSessionRole } from '../app/session-role-context'
import { ThemeToggle } from '../components/theme-toggle'
import {
  activeSessionRoles,
  sessionRoleShell,
  SESSION_ROLE_DESCRIPTIONS,
  SESSION_ROLE_LABELS,
  useMyAccess,
  type SessionRole,
} from '../features/access'

const ROLE_ICONS: Record<SessionRole, typeof User> = {
  member: User,
  moderator: Shield,
  admin: ShieldCheck,
}

const ROLE_CONTEXT: Record<SessionRole, string> = {
  member: 'For your clusters',
  moderator: 'For keeping things safe',
  admin: 'For platform operations',
}

export function SessionRolePage() {
  useDocumentTitle('Choose your mode')
  const navigate = useNavigate()
  const auth = useAuth()
  const access = useMyAccess()
  const { setRole } = useSessionRole()

  if (auth.state === 'signedOut') return <></>

  const available = activeSessionRoles(access.data)

  function choose(role: SessionRole) {
    setRole(role)
    navigate(sessionRoleShell(role))
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background px-4 py-4 text-on-surface sm:px-6 sm:py-6 lg:px-8 lg:py-7">
      <div className="mx-auto w-full max-w-5xl">
        <section className="flex min-w-0 flex-col px-1 py-2 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
          <header className="flex items-start justify-between gap-6">
            <Link to="/" className="font-brand text-base tracking-[0.18em] text-primary transition-colors hover:text-on-surface">
              Sensorium
            </Link>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>

          <div className="py-8 lg:py-10">
            <div className="max-w-xl">
              <h1 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-[-0.03em] text-on-surface sm:text-5xl">
                Choose a workspace
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-on-surface-variant">
                Select a workspace to open. Your account access stays the same, and you can switch views at any time.
              </p>
            </div>

            {access.isLoading && !access.data ? (
              <div className="mt-10 flex items-center gap-3 rounded-2xl bg-surface-container/60 p-5 text-sm text-on-surface-variant">
                <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
                Loading your available workspaces...
              </div>
            ) : access.isError || !access.data ? (
              <div className="mt-10 rounded-2xl border border-error/30 bg-error/10 p-6">
                <p className="text-sm font-semibold text-error">Could not load your available workspaces.</p>
                <button
                  type="button"
                  onClick={() => void access.refetch()}
                  className="mt-4 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container"
                >
                  Try again
                </button>
              </div>
            ) : (
              <ul className="mt-10 grid gap-4 sm:grid-cols-2" aria-label="Available workspaces">
                {available.map((role) => {
                  const Icon = ROLE_ICONS[role]
                  return (
                    <li key={role}>
                      <button
                        type="button"
                        onClick={() => choose(role)}
                        className="group relative flex min-h-52 w-full flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface p-5 text-left shadow-soft transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-lift focus-visible:-translate-y-1 sm:p-6"
                      >
                        <span className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-primary/5 transition-transform duration-300 group-hover:scale-[2.2]" aria-hidden />
                        <span className="relative flex items-start justify-between gap-4">
                          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-container/20 text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                            <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                          </span>
                          <ArrowUpRight className="h-5 w-5 text-on-surface-variant/50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" strokeWidth={1.5} aria-hidden />
                        </span>
                        <span className="relative mt-8 block">
                          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">{ROLE_CONTEXT[role]}</span>
                          <span className="mt-2 block text-xl font-semibold text-on-surface">{SESSION_ROLE_LABELS[role]}</span>
                          <span className="mt-2 block text-sm leading-6 text-on-surface-variant">{SESSION_ROLE_DESCRIPTIONS[role]}</span>
                        </span>
                        <span className="relative mt-5 flex items-center gap-2 text-sm font-semibold text-primary">
                          Open workspace
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={1.75} aria-hidden />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <footer className="flex items-start gap-3 border-t border-outline-variant/50 pt-5 text-xs leading-5 text-on-surface-variant sm:items-center">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-container text-primary">
              <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </span>
            <span>Changing your workspace only changes what you see in this tab. Your account access stays the same.</span>
          </footer>
        </section>
      </div>
    </main>
  )
}
