import { useState } from 'react'
import { Link } from 'react-router'
import { Sparkles, X } from 'lucide-react'
import { useMyMembership, useIntroProgress } from '../features/introductions'

const DISMISS_PREFIX = 'intro-nudge-dismissed:'

function wasDismissed(clusterId: string): boolean {
  try {
    return window.localStorage.getItem(`${DISMISS_PREFIX}${clusterId}`) === '1'
  } catch {
    return false
  }
}

/**
 * In-cluster introductions nudge. Intros are an optional checklist that never
 * blocks access: the banner shows only while the viewer's own intro is
 * pending and links to the answer form. Dismissible banners (room) remember
 * the dismissal per viewer; persistent banners (members tab) always stay
 * visible while pending, so the form is never unreachable.
 */
export function IntroChecklistBanner({
  clusterId,
  dismissible = true,
}: {
  clusterId: string
  dismissible?: boolean
}) {
  const membership = useMyMembership(clusterId)
  const progress = useIntroProgress(clusterId)
  const [dismissed, setDismissed] = useState(() => (dismissible ? wasDismissed(clusterId) : false))

  if (dismissed) return null
  if (membership.isLoading || !membership.data || membership.data.intro_completed_at) return null

  const rows = progress.data ?? []
  const done = rows.filter((r) => r.intro_completed_at).length

  function dismiss() {
    setDismissed(true)
    try {
      window.localStorage.setItem(`${DISMISS_PREFIX}${clusterId}`, '1')
    } catch {
      // Dismissal persistence is best-effort.
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary-container/15 px-4 py-3 shadow-soft">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-on-primary">
        <Sparkles className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="min-w-0 flex-1 text-sm text-on-surface">
        <span className="font-semibold">Complete your introductions</span>
        <span className="block truncate text-xs text-on-surface-variant">
          {rows.length > 0
            ? `${done} of ${rows.length} members finished.`
            : 'Tell your cluster who you are.'}
        </span>
      </p>
      <Link
        to={`/cluster/${clusterId}/introductions`}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-pill bg-primary px-4 py-2 text-xs font-semibold text-on-primary transition-colors hover:bg-primary-container"
      >
        Answer
      </Link>
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss introductions reminder"
          onClick={dismiss}
          className="grid h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface sm:h-8 sm:w-8 sm:min-h-[32px] sm:min-w-[32px]"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
