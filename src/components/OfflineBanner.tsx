import { WifiOff } from 'lucide-react'
import { useOnline } from '../lib/use-online'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="alert"
      data-e2e="offline-banner"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-error px-4 py-2 text-center text-sm font-semibold text-on-error"
    >
      <WifiOff className="h-4 w-4" strokeWidth={2} aria-hidden />
      You&apos;re offline. Updates will load when you reconnect.
    </div>
  )
}
