import { useState } from 'react'
import { cn } from '../lib/utils'
import { avatarFullFor, useAvatarFullUrl, useAvatarThumbUrl } from '../features/avatars'

export function Avatar({
  name,
  src,
  thumbSrc,
  className,
  textClassName,
}: {
  name: string
  src?: string | null
  thumbSrc?: string | null
  className?: string
  textClassName?: string
}) {
  // The thumb is only requested when the caller threads the explicit
  // `avatar_thumb_url` column through. Guessing it from the full path by
  // swapping the extension is wrong whenever the pair was stored with mixed
  // extensions (full JPG + thumb WebP): the signature for the guessed path
  // fails on every mount and the image visibly reloads on each navigation.
  // Without an explicit thumb the stored path itself is loaded directly, as
  // before the dual-variant upgrade. Fallback still covers an explicit thumb
  // that fails at signing or load time.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbSrc ?? src
  const full = avatarFullFor(src) ?? src ?? thumb
  const thumbQuery = useAvatarThumbUrl(thumb, src)
  const thumbFailed = thumbQuery.isError || failedSrc === thumbQuery.data
  const { data: fullUrl } = useAvatarFullUrl(full, thumb, { enabled: thumbFailed })
  const resolved = thumbFailed && fullUrl ? fullUrl : thumbQuery.data
  if (resolved) {
    return (
      <img
        key={resolved}
        src={resolved}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(thumbQuery.data ?? null)}
        className={cn('shrink-0 rounded-full bg-surface-container object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      style={{ containerType: 'inline-size' }}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary-container/25 font-display font-semibold text-primary',
        className,
      )}
    >
      <span aria-hidden className={cn('leading-none', textClassName ?? 'text-[42cqi]')}>
        {name.charAt(0).toUpperCase()}
      </span>
    </span>
  )
}
