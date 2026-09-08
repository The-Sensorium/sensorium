import { useContext } from 'react'
import { cn } from '../lib/utils'
import { ThemeContext, systemPrefersDark } from '../lib/theme'

export function BrandMark({
  size = 28,
  className,
  alt = '',
}: {
  size?: number
  className?: string
  alt?: string
}) {
  const ctx = useContext(ThemeContext)
  const resolved = ctx?.resolved ?? (systemPrefersDark() ? 'dark' : 'light')
  return (
    <img
      src={resolved === 'dark' ? '/logo-mark-dark.png' : '/logo-mark.png'}
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 rounded-xl object-cover', className)}
    />
  )
}
