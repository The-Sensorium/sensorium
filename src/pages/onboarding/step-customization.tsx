import { useEffect, useState } from 'react'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { prepareAvatarVariants, validateAvatarFile } from '../../lib/image'
import { toErrorMessage } from '../../lib/error'
import { useAvatarThumbUrl, deleteAvatarObjects, uploadAvatarPair } from '../../features/avatars'
import { AvatarCropModal } from '../../components/AvatarCropModal'
import type { OnboardingDraft } from './draft'

interface Props {
  userId: string
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

export function StepCustomization({ userId, draft, patch }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropFileName, setCropFileName] = useState('avatar.jpg')
  const { data: avatarSrc } = useAvatarThumbUrl(draft.avatarThumbUrl ?? draft.avatarUrl, draft.avatarUrl)

  useEffect(() => {
    return () => {
      if (cropSrc) URL.revokeObjectURL(cropSrc)
    }
  }, [cropSrc])

  async function uploadCroppedAvatar(file: File) {
    setUploading(true)
    setError(null)
    let uploaded: { fullPath: string; thumbPath: string } | null = null
    try {
      const variants = await prepareAvatarVariants(file)
      uploaded = await uploadAvatarPair(userId, variants.full, variants.thumb)
      await deleteAvatarObjects(draft.avatarUrl ?? null, draft.avatarThumbUrl ?? null).catch(() => {})
      patch({ photo: variants.full, avatarUrl: uploaded.fullPath, avatarThumbUrl: uploaded.thumbPath })
    } catch (err) {
      if (uploaded) {
        await deleteAvatarObjects(uploaded.fullPath, uploaded.thumbPath).catch(() => {})
      }
      setError(toErrorMessage(err, 'Couldn’t upload your photo.'))
    } finally {
      setUploading(false)
    }
  }

  function onFile(file: File | undefined) {
    if (!file) return
    const invalid = validateAvatarFile(file)
    if (invalid) {
      setError(invalid)
      return
    }
    if (file.type === 'image/gif') {
      void uploadCroppedAvatar(file)
      return
    }
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropFileName(file.name)
    setCropSrc(URL.createObjectURL(file))
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
              loading="lazy"
              decoding="async"
              className="h-20 w-20 rounded-full object-cover ring-1 ring-outline-variant/70"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
              <ImagePlus className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-pill border border-outline px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container">
              {draft.avatarUrl ? 'Change photo' : 'Upload photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  onFile(file)
                }}
              />
            </label>
            {draft.avatarUrl && (
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => {
                  void deleteAvatarObjects(draft.avatarUrl ?? null, draft.avatarThumbUrl ?? null).catch(() => {})
                  patch({ photo: null, avatarUrl: null, avatarThumbUrl: null })
                }}
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
        <span className="text-sm font-semibold text-on-surface">About</span>
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

      <AvatarCropModal
        open={cropSrc !== null}
        imageSrc={cropSrc}
        fileName={cropFileName}
        onClose={() => {
          if (cropSrc) URL.revokeObjectURL(cropSrc)
          setCropSrc(null)
        }}
        onCropped={(file) => {
          if (cropSrc) URL.revokeObjectURL(cropSrc)
          setCropSrc(null)
          void uploadCroppedAvatar(file)
        }}
      />
    </div>
  )
}
