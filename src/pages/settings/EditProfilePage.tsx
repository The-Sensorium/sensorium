import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { ArrowLeft, ChevronDown, Clock, ImageMinus, ImagePlus, Loader2, Save, UserRound } from 'lucide-react'
import { useDocumentTitle } from '../../lib/use-document-title'
import { useProfile } from '../../lib/use-profile'
import { requireSupabase } from '../../lib/supabase'
import { AVATAR_MAX_DIMENSION, prepareImage } from '../../lib/image'
import { toErrorMessage } from '../../lib/error'
import { useUpdateProfile } from '../../features/cluster'
import { deleteAvatarObject } from '../../features/avatars'
import { Avatar } from '../../components/Avatar'
import { Modal } from '../../components/Modal'
import { PronounSelect } from '../../components/PronounSelect'
import { timeZoneList } from '../../lib/timezones'

export function EditProfilePage() {
  useDocumentTitle('Edit profile')
  const navigate = useNavigate()
  const { key } = useLocation()
  const profile = useProfile()
  const [name, setName] = useState(profile.data?.display_name ?? '')
  const [bio, setBio] = useState(profile.data?.bio ?? '')
  const [pronouns, setPronouns] = useState(profile.data?.pronouns ?? '')
  const [status, setStatus] = useState(profile.data?.current_status ?? '')
  const [timezone, setTimezone] = useState(profile.data?.timezone ?? '')
  const [removeAvatarOpen, setRemoveAvatarOpen] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const updateProfile = useUpdateProfile()
  const zones = useMemo(() => timeZoneList(), [])

  // Profile loads async; pick up the saved zone once it arrives so saving
  // another field never wipes a value the user never touched.
  useEffect(() => {
    setTimezone(profile.data?.timezone ?? '')
  }, [profile.data?.timezone])

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
      const prepared = await prepareImage(file, { maxDimension: AVATAR_MAX_DIMENSION })
      const ext = prepared.name.split('.').pop()?.toLowerCase() || 'webp'
      const path = `${profile.data?.id ?? 'me'}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('avatars').upload(path, prepared, {
        cacheControl: '31536000',
        upsert: false,
        contentType: prepared.type,
      })
      if (error) throw error
      await updateProfile.mutateAsync({ avatar_url: data.path })
      // Reclaim the superseded object (owner-scoped delete, migration 0050). The
      // new avatar is already persisted, so a failed cleanup must not block it.
      await deleteAvatarObject(profile.data?.avatar_url ?? null).catch(() => {})
    } catch (err) {
      setAvatarError(toErrorMessage(err, 'Couldn’t upload your photo.'))
    } finally {
      setAvatarUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 pt-2">
      <button
        type="button"
        onClick={() => (key === 'default' ? navigate('/settings', { replace: true }) : navigate(-1))}
        className="-ml-3 inline-flex items-center gap-2 self-start rounded-lg px-3 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary-container/15 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Back
      </button>

      <header>
        <h1 className="font-display text-3xl font-semibold text-on-surface">Edit profile</h1>
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
          <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container">
            {avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
            {profile.data?.avatar_url ? 'Change' : 'Upload photo'}
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
              onClick={() => setRemoveAvatarOpen(true)}
              disabled={updateProfile.isPending}
              aria-label="Remove photo"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-pill border border-outline-variant/60 px-4 py-2 text-sm font-semibold text-on-surface-variant transition-colors hover:border-error/40 hover:text-error disabled:opacity-60"
            >
              <ImageMinus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Remove
            </button>
          )}
          {avatarError && (
            <p role="alert" className="text-sm text-error">
              {avatarError}
            </p>
          )}
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void updateProfile.mutateAsync({
              display_name: name.trim() || undefined,
              bio: bio.trim() || null,
              pronouns: pronouns.trim() || null,
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
              className="mt-1.5 w-full rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-base leading-6 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none sm:text-sm"
            />
          </label>
          <div className="block">
            <span className="text-sm font-semibold text-on-surface">Pronouns</span>
            <PronounSelect value={pronouns} onChange={setPronouns} />
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-on-surface">About</span>
            <textarea
              value={bio}
              maxLength={500}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A few sentences so your cluster knows who you are."
              className="mt-1.5 w-full resize-none rounded-lg border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-base leading-6 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none sm:text-sm"
            />
            <span className="mt-1 block text-right text-xs text-on-surface-variant">{bio.length}/500</span>
          </label>
          {updateProfile.isError && (
            <p role="alert" className="text-sm text-error">Couldn’t save your changes. Please try again.</p>
          )}
          <button
            type="submit"
            disabled={updateProfile.isPending || (name.trim() === (profile.data?.display_name ?? '') && bio.trim() === (profile.data?.bio ?? '') && pronouns.trim() === (profile.data?.pronouns ?? ''))}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
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
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void updateProfile.mutateAsync({ current_status: status.trim() || null })
          }}
        >
          <input
            type="text"
            maxLength={60}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="e.g. Deep in a good book"
            className="w-full rounded-pill border border-outline-variant/60 bg-surface-container/50 px-4 py-2.5 text-base leading-6 text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none sm:text-sm"
          />
          <button
            type="submit"
            disabled={updateProfile.isPending || status.trim() === (profile.data?.current_status ?? '')}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
            Save changes
          </button>
        </form>
      </section>

      <section aria-label="Local time" className="rounded-2xl border border-outline-variant/60 bg-surface p-5 shadow-soft">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="font-display text-lg font-semibold text-on-surface">Local time</h2>
        </div>
        <p className="mt-1 text-sm text-on-surface-variant">
          Shown on your member card in every cluster.
        </p>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void updateProfile.mutateAsync({ timezone: timezone || null })
          }}
        >
          <div className="relative">
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              aria-label="Timezone"
              className="w-full appearance-none rounded-pill border border-outline-variant/60 bg-surface-container py-2.5 pl-4 pr-10 text-base leading-6 text-on-surface focus:border-primary focus:outline-none sm:text-sm"
            >
              <option value="">Not set</option>
              {zones.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <button
            type="submit"
            disabled={updateProfile.isPending || (timezone || '') === (profile.data?.timezone ?? '')}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {updateProfile.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            )}
            Save changes
          </button>
        </form>
      </section>

      <RemoveAvatarModal
        open={removeAvatarOpen}
        onClose={() => setRemoveAvatarOpen(false)}
        onRemoved={() => setRemoveAvatarOpen(false)}
        avatarUrl={profile.data?.avatar_url ?? null}
      />
    </div>
  )
}

function RemoveAvatarModal({
  open,
  onClose,
  onRemoved,
  avatarUrl,
}: {
  open: boolean
  onClose: () => void
  onRemoved: () => void
  avatarUrl: string | null
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const updateProfile = useUpdateProfile()

  async function handleRemove() {
    setError(null)
    setPending(true)
    try {
      await updateProfile.mutateAsync({ avatar_url: null })
      // Reclaim the object behind the removed photo (owner-scoped delete).
      await deleteAvatarObject(avatarUrl).catch(() => {})
      onRemoved()
    } catch {
      setError('Could not remove your photo. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Remove photo?">
      <div className="mt-4 space-y-4">
        <p className="text-sm leading-6 text-on-surface-variant">
          Your photo will be removed from your profile, and members will see your initials instead.
        </p>
        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="min-h-[44px] flex-1 rounded-pill border border-outline-variant/70 px-5 py-2.5 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleRemove()}
            disabled={pending}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Remove photo
          </button>
        </div>
      </div>
    </Modal>
  )
}
