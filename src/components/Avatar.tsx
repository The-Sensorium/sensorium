import { useState } from 'react'
import { cn } from '../lib/utils'
import { avatarFullFor, avatarThumbFor, useAvatarFullUrl, useAvatarThumbUrl } from '../features/avatars'

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
  // The derived thumb path may not exist (GIF/small single-file rows, or a
  // mismatched extension). Signing a missing object errors, so the thumb
  // query fails without ever rendering an image: fall back on query error
  // as well as on image load error. Both comparisons reset on their own
  // when the avatar changes (new query key, new signed URL).
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const thumb = thumbSrc ?? avatarThumbFor(src) ?? src
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
