export function RoutePending() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6">
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
        <div className="route-pending-bar h-full w-1/3 rounded-pill bg-primary" />
      </div>
      <div className="space-y-3 pt-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-container motion-reduce:animate-none" />
        <div className="h-4 w-64 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
      </div>
      <div className="space-y-3 rounded-2xl border border-outline-variant/60 bg-surface p-5">
        <div className="h-4 w-3/4 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
        <div className="h-4 w-1/2 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
        <div className="h-4 w-2/3 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
      </div>
      <div className="space-y-3 rounded-2xl border border-outline-variant/60 bg-surface p-5">
        <div className="h-4 w-2/3 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
        <div className="h-4 w-1/3 animate-pulse rounded-pill bg-surface-container motion-reduce:animate-none" />
      </div>
    </div>
  )
}
