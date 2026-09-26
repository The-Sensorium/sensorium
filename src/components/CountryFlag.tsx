import { hasFlag } from 'country-flag-icons'
import * as Flags from 'country-flag-icons/react/3x2'
import { cn } from '../lib/utils'

interface CountryFlagProps {
  code: string
  className?: string
  label?: string
}

/** Proper SVG flag for an ISO 3166-1 alpha-2 code. Decorative by default;
 * pass `label` when no adjacent country name carries the accessible name. */
export function CountryFlag({ code, className, label }: CountryFlagProps) {
  const upper = code.toUpperCase()
  if (!hasFlag(upper)) return null
  const Flag = (Flags as Record<string, React.ComponentType<React.HTMLAttributes<HTMLElement>> | undefined>)[upper]
  if (!Flag) return null
  return (
    <Flag
      aria-hidden={label === undefined}
      aria-label={label}
      title={label}
      className={cn('h-4 w-6 shrink-0 rounded-[3px]', className)}
    />
  )
}
