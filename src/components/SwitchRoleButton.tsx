import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { createPortal, flushSync } from 'react-dom'
import { BriefcaseBusiness, Check, ChevronDown, LogOut, Shield, ShieldCheck, User } from 'lucide-react'
import { useSessionRole } from '../app/session-role-context'
import {
  activeSessionRoles,
  SESSION_ROLE_DESCRIPTIONS,
  SESSION_ROLE_LABELS,
  sessionRoleShell,
  useMyAccess,
  type SessionRole,
} from '../features/access'
import { SignOutModal } from './SignOutModal'

const ROLE_ICONS: Record<SessionRole, typeof User> = {
  member: User,
  moderator: Shield,
  admin: ShieldCheck,
}

/** Opens a compact workspace menu without exposing the role picker as navigation. */
export function SwitchRoleButton() {
  const navigate = useNavigate()
  const access = useMyAccess()
  const { role, setRole } = useSessionRole()
  const [open, setOpen] = useState(false)
  const [pendingRole, setPendingRole] = useState<SessionRole | null>(null)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const available = activeSessionRoles(access.data)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setPendingRole(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        setPendingRole(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  if (access.isLoading || access.isError || !access.data) return null
  if (available.length < 2) return null
  const currentRole = role ?? available[0]

  function choose(nextRole: SessionRole) {
    if (nextRole === currentRole) {
      setOpen(false)
      return
    }
    setPendingRole(nextRole)
  }

  function confirmSwitch() {
    if (!pendingRole) return
    flushSync(() => setRole(pendingRole))
    setPendingRole(null)
    setOpen(false)
    navigate(sessionRoleShell(pendingRole))
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Choose workspace"
        onClick={() => {
          setOpen((value) => !value)
          setPendingRole(null)
        }}
        className="inline-flex items-center gap-2 rounded-pill border border-outline-variant/60 px-3 py-2 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
      >
        <BriefcaseBusiness className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        <span className="hidden sm:inline">{SESSION_ROLE_LABELS[currentRole]} workspace</span>
        <span className="sm:hidden">{SESSION_ROLE_LABELS[currentRole]}</span>
        <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Available workspaces"
          className="fixed left-1/2 top-16 z-50 -translate-x-1/2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-lowest p-2 shadow-lift lg:absolute lg:left-auto lg:right-0 lg:top-full lg:mt-2 lg:translate-none"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Workspace</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">Choose which part of Sensorium to open.</p>
          </div>

          <div className="space-y-1">
            {available.map((availableRole) => {
              const Icon = ROLE_ICONS[availableRole]
              const selected = availableRole === currentRole
              return (
                <button
                  key={availableRole}
                  type="button"
                  role="menuitem"
                  onClick={() => choose(availableRole)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-container"
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-container/20 text-primary">
                    <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                      {SESSION_ROLE_LABELS[availableRole]}
                      {selected && <span className="text-xs font-medium text-primary">Current</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-on-surface-variant">
                      {SESSION_ROLE_DESCRIPTIONS[availableRole]}
                    </span>
                  </span>
                  {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-primary" strokeWidth={2} aria-hidden />}
                </button>
              )
            })}
          </div>

          {pendingRole && (
            <div className="mt-2 border-t border-outline-variant/50 px-3 pb-1 pt-3">
              <p className="text-sm font-semibold text-on-surface">Switch to {SESSION_ROLE_LABELS[pendingRole]}?</p>
              <p className="mt-1 text-xs leading-5 text-on-surface-variant">You will leave this workspace and open the other one.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingRole(null)}
                  className="rounded-pill px-3 py-1.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSwitch}
                  className="rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
                >
                  Switch workspace
                </button>
              </div>
            </div>
          )}

          <div className="mt-1 border-t border-outline-variant/50 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setSignOutOpen(true)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-error transition-colors hover:bg-error/5"
            >
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-error/10 text-error">
                <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </span>
              <span className="text-sm font-semibold">Sign out</span>
            </button>
          </div>
        </div>
      )}

      {createPortal(
        <SignOutModal
          open={signOutOpen}
          onClose={() => setSignOutOpen(false)}
          onSignedOut={() => navigate('/auth/login')}
        />,
        document.body,
      )}
    </div>
  )
}
