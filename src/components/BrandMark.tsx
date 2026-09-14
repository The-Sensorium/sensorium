import { cn } from '../lib/utils'
import { LOGO_MARK_D, LOGO_MARK_VIEWBOX } from './logoMarkPath'

export function BrandMark({
  size = 28,
  className,
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  const labelled = alt.length > 0
  return (
    <svg
      viewBox={LOGO_MARK_VIEWBOX}
      width={size}
      height={size}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? alt : undefined}
      aria-hidden={labelled ? undefined : true}
      className={cn('shrink-0 rounded-xl', className)}
      style={{ color: 'var(--color-primary)' }}
    >
      <path d={LOGO_MARK_D} fill="currentColor" />
    </svg>
  )
}
