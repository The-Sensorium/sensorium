import { cn } from '../lib/utils'
import { useOnline } from '../lib/use-online'
import { ThemeToggle } from './theme-toggle'

export function FixedThemeToggle({ className }: { className?: string }) {
  const online = useOnline()
  return (
    <div className={cn('fixed right-4 z-30', online ? 'top-4' : 'top-16', className)}>
      <ThemeToggle />
    </div>
  )
}
