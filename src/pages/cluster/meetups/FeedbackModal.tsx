import { useEffect, useState } from 'react'
import { Modal } from '../../../components/Modal'
import { rateLimitMessage } from '../../../lib/error'
import { pluralize } from '../../../lib/meetup'
import { useSubmitMeetupFeedback } from '../../../features/meetups'

type Rating = 'loved' | 'nice' | 'not_for_me'
type MeetAgain = 'yes' | 'maybe'

/**
 * Rating is required; tapping a meet-again answer submits immediately so the
 * dialog never traps the user in a half-filled form. Dismissing without
 * submitting is always allowed.
 */

const RATINGS: Array<{ value: Rating; label: string }> = [
  { value: 'loved', label: 'Loved it' },
  { value: 'nice', label: 'It was nice' },
  { value: 'not_for_me', label: 'Not really for me' },
]

/** Post-call follow-up. Always dismissible, never blocks return to cluster. */
export function FeedbackModal({
  open,
  onClose,
  clusterId,
  meetupId,
  joinedCount,
}: {
  open: boolean
  onClose: () => void
  clusterId: string | null
  meetupId: string | null
  joinedCount: number
}) {
  const [rating, setRating] = useState<Rating | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = useSubmitMeetupFeedback(clusterId, meetupId)

  // A dismissed dialog restarts fresh; a stale rating would mis-submit.
  useEffect(() => {
    if (open) {
      setRating(null)
      setError(null)
    }
  }, [open])

  async function handleSubmit(meetAgain: MeetAgain) {
    if (!rating) return
    setError(null)
    try {
      await submit.mutateAsync({ rating, meetAgain })
      onClose()
    } catch (err) {
      setError(rateLimitMessage(err, 'Could not save your feedback'))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="That was your Cluster Meetup">
      <div data-e2e="meetup-feedback" className="space-y-4 pt-2">
        <p className="text-sm text-on-surface-variant">{pluralize(joinedCount, 'member', 'members')} joined. How was it?</p>
        {error && (
          <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-2.5 text-sm text-error">
            {error}
          </p>
        )}
        <div className="space-y-2" role="radiogroup" aria-label="How was it">
          {RATINGS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={rating === r.value}
              onClick={() => setRating(r.value)}
              className={
                rating === r.value
                  ? 'flex w-full items-center gap-3 rounded-xl border border-primary bg-primary-container/20 px-3.5 py-2.5 text-left text-sm font-semibold text-on-surface'
                  : 'flex w-full items-center gap-3 rounded-xl border border-outline-variant/60 px-3.5 py-2.5 text-left text-sm text-on-surface hover:bg-surface-container'
              }
            >
              <span
                aria-hidden
                className={
                  rating === r.value
                    ? 'grid h-5 w-5 place-items-center rounded-full border border-primary bg-primary text-[10px] text-on-primary'
                    : 'grid h-5 w-5 place-items-center rounded-full border border-outline-variant'
                }
              >
                {rating === r.value ? '●' : ''}
              </span>
              {r.label}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-on-surface">Meet again next week?</p>
          {!rating && (
            <p className="text-xs text-on-surface-variant">Pick a rating above first.</p>
          )}
          <button
            type="button"
            disabled={!rating || submit.isPending}
            onClick={() => void handleSubmit('yes')}
            className="min-h-[48px] w-full rounded-pill bg-primary px-5 py-3 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
          >
            {submit.isPending ? 'Saving…' : 'Yes, let us meet again'}
          </button>
          <button
            type="button"
            disabled={!rating || submit.isPending}
            onClick={() => void handleSubmit('maybe')}
            className="min-h-[48px] w-full rounded-pill border border-outline-variant/60 px-5 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:opacity-50"
          >
            Maybe next time
          </button>
          <p className="text-center text-xs text-on-surface-variant">You can always skip a week.</p>
        </div>
      </div>
    </Modal>
  )
}
