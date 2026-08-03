import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BellRing, ImagePlus, Loader2, LogOut, Trash2, UserRound, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useDocumentTitle } from '../lib/use-document-title'
import { useProfile } from '../lib/use-profile'
import { requireSupabase } from '../lib/supabase'
import { prepareImage } from '../lib/image'
import { useMyClusters } from '../features/matching'
import { useUpdateProfile } from '../features/cluster'
import { useDeleteAccount } from '../features/moderation'
import {
  PREF_LABELS,
  PREF_TOGGLES,
  useNotificationPrefs,
  useUpsertNotificationPrefs,
  type PrefToggle,
} from '../features/notifications'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'

export function SettingsPage() {
  useDocumentTitle('Settings')
  const navigate = useNavigate()
  const profile = useProfile()
  const [name, setName] = useState(profile.data?.display_name ?? '')
  const [bio, setBio] = useState(profile.data?.bio ?? '')
  const [status, setStatus] = useState(profile.data?.current_status ?? '')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const saveStatus = useUpdateProfile()
  const saveProfile = useUpdateProfile()

  async function handleAvatar(file: File | undefined) {
    if (!file) return
    const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!ACCEPTED.includes(file.type)) {
      setAvatarError('Please choose a JPG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('That image is larger than 5 MB.')
      return
    }
    setAvatarUploading(true)
    setAvatarError(null)
    try {
      const supabase = requireSupabase()
      const prepared = await prepareImage(file, { maxDimension: 512 })
      const ext = prepared.name.split('.').pop()?.toLowerCase() || 'webp'
      const path = `${profile.data?.id ?? 'me'}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('avatars').upload(path, prepared, {
        cacheControl: '3600',
        upsert: false,
        contentType: prepared.type,
      })
      if (error) throw error
      await saveProfile.mutateAsync({ avatar_url: data.path })
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Couldn’t upload your photo.')
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="pt-2">
        <h1 className="font-display text-3xl font-semibold text-on-surface">Settings</h1>
      </header>

      <section aria-label="Profile" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <div className="flex items-start gap-4">
          <Avatar name={profile.data?.display_name ?? 'You'} src={profile.data?.avatar_url} className="h-14 w-14" textClassName="text-xl" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-semibold text-on-surface">
              {profile.data?.display_name ?? 'You'}
            </h2>
            <p className="truncate text-sm text-on-surface-variant">{profile.data?.email}</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container">
            {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            {profile.data?.avatar_url ? 'Change photo' : 'Upload photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => void handleAvatar(e.target.files?.[0])}
            />
          </label>
          {profile.data?.avatar_url && (
            <button
              type="button"
              onClick={() => void saveProfile.mutateAsync({ avatar_url: null })}
              disabled={saveProfile.isPending}
              className="inline-flex items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:border-error/40 hover:text-error disabled:opacity-60"
            >
              <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Remove photo
            </button>
          )}
          {avatarError && <p className="text-sm text-error">{avatarError}</p>}
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void saveProfile.mutateAsync({
              display_name: name.trim() || undefined,
              bio: bio.trim() || null,
            })
          }}
        >
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Display name</span>
            <input
              type="text"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="What members see"
              className="mt-1.5 w-full rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">Bio</span>
            <textarea
              value={bio}
              maxLength={500}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A few sentences so your cluster knows who you are."
              className="mt-1.5 w-full resize-none rounded-lg border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
            />
            <span className="mt-1 block text-right text-xs text-on-surface-variant">{bio.length}/500</span>
          </label>
          {saveProfile.isError && (
            <p role="alert" className="text-sm text-error">Couldn’t save your profile. Please try again.</p>
          )}
          <button
            type="submit"
            disabled={saveProfile.isPending || (name.trim() === (profile.data?.display_name ?? '') && bio.trim() === (profile.data?.bio ?? ''))}
            className="inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {saveProfile.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save changes
          </button>
        </form>
      </section>

      <section aria-label="Status" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <UserRound className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="font-display text-lg font-semibold text-on-surface">Status</h2>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          Shown on your member card in every cluster.
        </p>
        <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void saveStatus.mutateAsync({ current_status: status.trim() || null })
          }}
        >
          <input
            type="text"
            maxLength={80}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="e.g. Deep in a good book"
            className="min-w-0 flex-1 rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
          <button
            type="submit"
            disabled={saveStatus.isPending || status.trim() === (profile.data?.current_status ?? '')}
            className="inline-flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {saveStatus.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save
          </button>
        </form>
      </section>

      <NotificationPreferences />

      <section aria-label="Account" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <h2 className="font-display text-lg font-semibold text-on-surface">Account</h2>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-error/40 px-5 py-2.5 text-sm font-semibold text-error transition-colors hover:bg-error/5 sm:flex-1"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Delete account
          </button>
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-pill border border-outline-variant/60 px-5 py-2.5 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container sm:flex-1"
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

function SignOutModal({
  open,
  onClose,
  onSignedOut,
}: {
  open: boolean
  onClose: () => void
  onSignedOut: () => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSignOut() {
    setError(null)
    setPending(true)
    try {
      const supabase = requireSupabase()
      await supabase.auth.signOut()
      queryClient.clear()
      onSignedOut()
    } catch {
      setError('Could not sign out. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Sign out?">
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-on-surface-variant">
          You’ll need to sign back in to see your clusters and conversations.
        </p>
        {error && <p className="text-sm text-error">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={pending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Sign out
          </button>
        </div>
      </div>
    </Modal>
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
            This permanently deletes your profile, messages, moods, signals and memberships.
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
            className="w-full rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:border-error focus:outline-none"
          />
        </label>
        {error && <p className="text-sm text-error">{error}</p>}
        <button
          type="button"
          disabled={confirm !== 'DELETE' || deleteAccount.isPending}
          onClick={() => void handleDelete()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-error px-5 py-2.5 text-sm font-semibold text-on-error transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {deleteAccount.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Delete my account
        </button>
      </div>
    </Modal>
  )
}

function NotificationPreferences() {
  const clusters = useMyClusters()
  const prefs = useNotificationPrefs()
  const upsert = useUpsertNotificationPrefs()
  const [pending, setPending] = useState<Record<string, boolean | undefined>>({})
  const [prefError, setPrefError] = useState<string | null>(null)

  const byCluster = new Map((prefs.data ?? []).map((p) => [p.cluster_id, p]))

  function prefFor(clusterId: string, toggle: PrefToggle): boolean {
    const pendingValue = pending[`${clusterId}:${toggle}`]
    if (pendingValue !== undefined) return pendingValue
    return byCluster.get(clusterId)?.[toggle] ?? true
  }

  function toggle(clusterId: string, key: PrefToggle, value: boolean) {
    const current = { messages: false, mentions: false, reactions: false, votes: false, invitations: false, signals: false }
    const existing = byCluster.get(clusterId)
    for (const t of PREF_TOGGLES) current[t] = existing?.[t] ?? true
    current[key] = value
    setPending((p) => ({ ...p, [`${clusterId}:${key}`]: value }))
    setPrefError(null)
    upsert
      .mutateAsync({ clusterId, toggles: current })
      .catch((err: unknown) => setPrefError(err instanceof Error ? err.message : 'Couldn’t save your preferences.'))
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
          {(clusters.data ?? []).map(({ cluster }) => (
            <div key={cluster.id} className="rounded-xl border border-outline-variant/60 p-4">
              <h3 className="truncate text-sm font-semibold text-on-surface">{cluster.name}</h3>
              <ul className="mt-3 space-y-3">
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
            </div>
          ))}
        </div>
      )}
    </section>
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
