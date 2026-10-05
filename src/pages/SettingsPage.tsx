import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { AlertTriangle, BellRing, Check, ChevronDown, ChevronRight, Loader2, LogOut, Monitor, Moon, Pencil, ShieldCheck, Sun, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { useDocumentTitle } from '../lib/use-document-title'
import { useTheme, type ThemeMode } from '../lib/theme'
import { useProfile } from '../lib/use-profile'
import { toErrorMessage } from '../lib/error'
import { useMyClusters } from '../features/matching'
import { useDeleteAccount, useMyMutes } from '../features/moderation'
import { hasCapability, useMyAccess } from '../features/access'
import { useMfaStatus } from '../features/staff-mfa'
import { isMobileDevice } from '../lib/device'
import {
  PREF_LABELS,
  PREF_TOGGLES,
  useNotificationPrefs,
  useUpsertNotificationPrefs,
  type PrefToggle,
} from '../features/notifications'
import { Avatar } from '../components/Avatar'
import { MuteButton } from '../components/MuteButton'
import { Modal } from '../components/Modal'
import { ProfileStatusSection } from '../components/ProfileStatusSection'
import { SignOutModal } from '../components/SignOutModal'

export function SettingsPage() {
  useDocumentTitle('Settings')
  const navigate = useNavigate()
  const profile = useProfile()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Settings</h1>
      </header>

      <Link
        to="/settings/profile"
        aria-label="Edit profile"
        className="flex items-center gap-4 rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft transition-colors hover:border-outline/60"
      >
        <Avatar name={profile.data?.display_name ?? 'You'} src={profile.data?.avatar_url} className="h-14 w-14" textClassName="text-xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-lg font-semibold text-on-surface">
            {profile.data?.display_name ?? 'You'}
          </span>
          <span className="block truncate text-sm text-on-surface-variant">{profile.data?.current_status ?? profile.data?.email}</span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-on-primary" aria-hidden>
          <Pencil className="h-[18px] w-[18px]" strokeWidth={1.5} />
        </span>
      </Link>

      <ProfileStatusSection />

      <NotificationPreferences />

      <AppearanceSection />

      <SafetySection />

      <section aria-label="Account" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Account</h2>
        <MfaRow />
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill border border-error/40 px-5 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5 sm:flex-1"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Delete account
          </button>
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container sm:flex-1"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Sign out
          </button>
        </div>
      </section>

      <DeleteAccountModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => navigate('/')}
      />

      <SignOutModal
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onSignedOut={() => navigate('/auth/login')}
      />
    </div>
  )
}

function AppearanceSection() {
  const { mode, setMode } = useTheme()
  return (
    <section aria-label="Appearance" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Sun className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-on-surface">Appearance</h2>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Light, dark, or follow your system.
      </p>
      <div role="radiogroup" aria-label="Appearance" className="mt-4 space-y-1">
        {appearanceOptions.map((opt) => {
          const active = mode === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={opt.label}
              onClick={() => setMode(opt.value)}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                active ? 'bg-primary-container/15 text-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
              )}
            >
              <opt.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />
              <span className="min-w-0 flex-1 text-left font-semibold">{opt.label}</span>
              {active && <Check className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

const appearanceOptions: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
]

function MfaRow() {
  const access = useMyAccess()
  const staff = hasCapability(access.data, 'can_moderate')
  const mfa = useMfaStatus(access.data != null)
  const enrolled = (mfa.data?.verifiedTotpCount ?? 0) > 0

  // Staff-only surface: plain members get no upsell, but anyone already
  // enrolled keeps the row to manage or remove their factors. Staff tools
  // are desktop-only, so mobile browsers never see the row.
  if (isMobileDevice()) return null
  if (!staff && !enrolled) return null

  const detail = mfa.isLoading
    ? 'Checking…'
    : mfa.isError || mfa.data == null
      ? 'Manage'
      : enrolled
        ? `${mfa.data.verifiedTotpCount} authenticator connected`
        : 'Not set up';

  return (
    <Link
      to="/mfa-setup"
      data-e2e="settings-mfa-link"
      className="mt-4 flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-container"
    >
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-on-surface">Two-step verification</span>
        <span className="block truncate text-xs text-on-surface-variant">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-on-surface-variant" strokeWidth={1.5} aria-hidden />
    </Link>
  )
}

function DeleteAccountModal({
  open,
  onClose,
  onDeleted,
}: {
  open: boolean
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const deleteAccount = useDeleteAccount()

  async function handleDelete() {
    setError(null)
    try {
      await deleteAccount.mutateAsync()
      onDeleted()
    } catch {
      setError('Could not delete your account. Please try again.')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Delete account">
      <div className="mt-4 space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-error/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" strokeWidth={1.5} aria-hidden />
          <p className="text-sm leading-6 text-on-surface-variant">
            This permanently deletes your profile, messages, signals and memberships.
            This cannot be undone. To confirm, type <span className="font-semibold text-error">DELETE</span>.
          </p>
        </div>
        <label className="block">
          <span className="sr-only">Type DELETE to confirm</span>
          <input
            type="text"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Type DELETE to confirm"
            autoComplete="off"
              className="w-full rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-base leading-6 text-on-surface placeholder:text-on-surface-variant focus:border-error focus:outline-none sm:text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={confirm !== 'DELETE' || deleteAccount.isPending}
          onClick={() => void handleDelete()}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-error px-5 py-3 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Delete my account
        </button>
      </div>
    </Modal>
  )
}

function SafetySection() {
  const mutes = useMyMutes()
  const muted = mutes.data ?? []

  return (
    <section aria-label="Safety" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-on-surface">Safety</h2>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Muted members are hidden for you only. They are never told.
      </p>
      <Link
        to="/settings/reports"
        className="mt-3 inline-flex min-h-[44px] items-center rounded-pill border border-primary/50 px-5 py-2 text-sm font-semibold text-primary transition-colors hover:border-primary hover:bg-primary/5"
      >
        My reports
      </Link>
      {(mutes.isLoading || mutes.isError || muted.length > 0) && (
        <div className="mt-4">
          {mutes.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-on-surface-variant">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
            </p>
          ) : mutes.isError ? (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
              Couldn’t load your muted members. Please try again.
            </p>
          ) : (
            <ul className="space-y-2">
              {muted.map((m) => (
                <li key={m.muted_user_id} className="flex items-center justify-between gap-4 rounded-xl border border-outline-variant/60 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={m.display_name ?? 'Member'}
                      src={m.avatar_url}
                      className="h-8 w-8"
                      textClassName="text-sm"
                    />
                    <span className="truncate text-sm text-on-surface">{m.display_name ?? 'Member'}</span>
                  </span>
                  <MuteButton targetUserId={m.muted_user_id} targetName={m.display_name ?? 'Member'} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function NotificationPreferences() {
  const clusters = useMyClusters()
  const prefs = useNotificationPrefs()
  const upsert = useUpsertNotificationPrefs()
  const [pending, setPending] = useState<Record<string, boolean | undefined>>({})
  const [prefError, setPrefError] = useState<string | null>(null)

  const byCluster = new Map((prefs.data ?? []).map((p) => [p.cluster_id, p]))
  const list = useMemo(() => clusters.data ?? [], [clusters.data])
  const [expandedIds, setExpandedIds] = useState<readonly string[] | null>(null)
  // Latch the single-cluster default once seen so joining a second cluster
  // mid-session doesn't snap the open card shut. Other counts keep deriving
  // until the user touches a card, so a lone remaining cluster still opens.
  useEffect(() => {
    setExpandedIds((prev) => prev ?? (list.length === 1 ? [list[0].cluster.id] : prev))
  }, [list])
  const openIds = expandedIds ?? (list.length === 1 ? [list[0].cluster.id] : [])

  function setOpen(clusterId: string, open: boolean) {
    setExpandedIds((prev) => {
      const base = prev ?? (list.length === 1 ? [list[0].cluster.id] : [])
      return open ? [...new Set([...base, clusterId])] : base.filter((id) => id !== clusterId)
    })
  }

  function prefFor(clusterId: string, toggle: PrefToggle): boolean {
    const pendingValue = pending[`${clusterId}:${toggle}`]
    if (pendingValue !== undefined) return pendingValue
    return byCluster.get(clusterId)?.[toggle] ?? true
  }

  function toggle(clusterId: string, key: PrefToggle, value: boolean) {
    const current: Record<PrefToggle, boolean> = {
      messages: false,
      mentions: false,
      reactions: false,
      votes: false,
      meetups: false,
      invitations: false,
      signals: false,
      post_comment: false,
      post_like: false,
    }
    const existing = byCluster.get(clusterId)
    for (const t of PREF_TOGGLES) current[t] = existing?.[t] ?? true
    current[key] = value
    setPending((p) => ({ ...p, [`${clusterId}:${key}`]: value }))
    setPrefError(null)
    upsert
      .mutateAsync({ clusterId, toggles: current })
      .catch((err: unknown) => setPrefError(toErrorMessage(err, 'Couldn’t save your preferences.')))
      .finally(() => setPending((p) => ({ ...p, [`${clusterId}:${key}`]: undefined })))
  }

  return (
    <section aria-label="Notification preferences" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <BellRing className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-lg font-semibold text-on-surface">Notification preferences</h2>
      </div>
      <p className="mt-1 text-sm text-on-surface-variant">
        Tune what lands in your notification center, per cluster.
      </p>

      {clusters.isLoading || prefs.isLoading ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-on-surface-variant">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      ) : clusters.isError || prefs.isError ? (
        <p role="alert" className="mt-4 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          Couldn’t load your preferences. Please try again.
        </p>
      ) : (clusters.data ?? []).length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface-container/50 px-4 py-3 text-sm text-on-surface-variant">
          No clusters yet. Preferences appear here once you join a cluster.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {prefError && (
            <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
              {prefError}
            </p>
          )}
          {list.map(({ cluster }) => {
            const open = openIds.includes(cluster.id)
            const off = PREF_TOGGLES.filter((key) => !prefFor(cluster.id, key)).length
            const summary = off === 0 ? 'All on' : off === PREF_TOGGLES.length ? 'All off' : `${off} off`
            return (
              <ClusterPrefCard
                key={cluster.id}
                clusterId={cluster.id}
                name={cluster.name}
                summary={summary}
                open={open}
                onOpenChange={(next) => setOpen(cluster.id, next)}
              >
                <ul className="space-y-3">
                  {PREF_TOGGLES.map((key) => {
                    const value = prefFor(cluster.id, key)
                    const saving = pending[`${cluster.id}:${key}`] !== undefined
                    return (
                      <li key={key} className="flex items-center justify-between gap-4">
                        <span className="text-sm text-on-surface-variant">{PREF_LABELS[key]}</span>
                        <span className="flex items-center gap-2">
                          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-on-surface-variant" aria-hidden />}
                          <Toggle checked={value} label={PREF_LABELS[key]} onChange={(v) => toggle(cluster.id, key, v)} />
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </ClusterPrefCard>
            )
          })}
        </div>
      )}
    </section>
  )
}

function ClusterPrefCard({
  clusterId,
  name,
  summary,
  open,
  onOpenChange,
  children,
}: {
  clusterId: string
  name: string
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const regionId = `notif-prefs-${clusterId}`
  return (
    <div className="rounded-xl border border-outline-variant/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onOpenChange(!open)}
        className="flex w-full items-center gap-3 rounded-xl p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-on-surface">{name}</span>
          <span className="mt-0.5 block text-xs text-on-surface-variant">{summary}</span>
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-on-surface-variant transition-transform motion-reduce:transition-none', open && 'rotate-180')}
          strokeWidth={1.5}
          aria-hidden
        />
      </button>
      {/* Collapsed content stays mounted for the expand transition (inert, not
          focusable). Tests must scope toggle queries to the expanded card. */}
      <div
        id={regionId}
        inert={!open}
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          open ? '[grid-template-rows:1fr]' : '[grid-template-rows:0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  )
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        checked ? 'bg-primary' : 'bg-outline-variant',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}
