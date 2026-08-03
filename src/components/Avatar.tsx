import { cn } from '../lib/utils'
import { useAvatarUrl } from '../features/avatars'

export function Avatar({
  name,
  src,
  className,
  textClassName,
}: {
  name: string
  src?: string | null
  className?: string
  textClassName?: string
}) {
  const { data: resolved } = useAvatarUrl(src)
  if (resolved) {
    return (
      <img
        src={resolved}
        alt={name}
        loading="lazy"
        className={cn('shrink-0 rounded-full bg-surface-container object-cover', className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-primary-container/25 font-display font-semibold text-primary',
        className,
        textClassName,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}
