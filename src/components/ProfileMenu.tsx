import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, LogOut, Monitor, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTheme, type ThemeMode } from '../lib/theme'
import { useProfile } from '../lib/use-profile'
import { Avatar } from './Avatar'
import { SignOutModal } from './SignOutModal'

const themeOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function ProfileMenu({ className }: { className?: string }) {
  const profile = useProfile()
  const navigate = useNavigate()
  const { mode, setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open ])

  const name = profile.data?.display_name ?? 'You'

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={`Account menu for ${name}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((openState) => !openState)}
        className="flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-surface-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Avatar name={name} src={profile.data?.avatar_url} className="h-9 w-9" textClassName="text-sm" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-11 z-30 w-60 rounded-lg border border-outline-variant/60 bg-surface p-1.5 shadow-lift"
        >
          <p className="truncate px-3 pb-1.5 pt-2 text-sm font-semibold text-on-surface">{name}</p>
          <p className="truncate px-3 pb-2 text-xs text-on-surface-variant">{profile.data?.email}</p>
          <Link
            to="/settings/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <UserRound className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Edit profile
          </Link>
          <Link
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setSignOutOpen(true)
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Sign out
          </button>
          <div role="separator" className="mx-3 my-1.5 border-t border-outline-variant/60" />
          <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">
            Appearance
          </p>
          {themeOptions.map((opt) => {
            const active = mode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setMode(opt.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-primary-container/15 text-primary'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
                )}
              >
                <opt.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                <span className="flex-1 text-left">{opt.label}</span>
                {active && <Check className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
      <SignOutModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onSignedOut={() => navigate('/auth/login')}
      />
    </div>
  )
}
