import { useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { requireSupabase } from '../../lib/supabase'
import { prepareImage } from '../../lib/image'
import { useAvatarUrl } from '../../features/avatars'
import type { OnboardingDraft } from './draft'

interface Props {
  userId: string
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = requireSupabase()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage.from('avatars').upload(path, file, {
    cacheControl: '31536000',
    upsert: false,
    contentType: file.type,
  })
  if (error) throw error
  return data.path
}

export function StepCustomization({ userId, draft, patch }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: avatarSrc } = useAvatarUrl(draft.avatarUrl)

  async function onFile(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED.includes(file.type)) {
      setError('Please choose a JPG, PNG, WebP, or GIF image.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('That image is larger than 5 MB.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const prepared = await prepareImage(file, { maxDimension: 512 })
      const url = await uploadAvatar(userId, prepared)
      patch({ photo: prepared, avatarUrl: url })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t upload your photo.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-on-surface">Make it yours</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Both are optional. You can always change them later.
        </p>
      </div>

      <div>
        <span className="text-sm font-semibold text-on-surface">Profile photo</span>
        <div className="mt-2 flex items-center gap-4">
          {draft.avatarUrl && avatarSrc ? (
            <img
              src={avatarSrc}
              alt="Your profile photo"
              className="h-20 w-20 rounded-full object-cover ring-1 ring-outline-variant/70"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <ImagePlus className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-pill border border-outline px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container">
              {draft.avatarUrl ? 'Change photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </label>
            {draft.avatarUrl && (
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => patch({ photo: null, avatarUrl: null })}
                className="flex h-9 w-9 items-center justify-center rounded-pill text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            )}
            {uploading && <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Uploading" />}
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-on-surface">Bio</span>
        <textarea
          value={draft.bio}
          onChange={(e) => patch({ bio: e.target.value })}
          maxLength={500}
          rows={4}
          placeholder="A few sentences so your cluster knows who you are."
          className="mt-1.5 w-full resize-none rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="mt-1 block text-right text-xs text-on-surface-variant">
          {draft.bio.length}/500
        </span>
      </label>
    </div>
  )
}
