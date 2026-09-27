import { useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { toErrorMessage } from '../../lib/error'
import { useQueueCount } from '../../features/matching'
import { localQueueKey, type OnboardingDraft } from './draft'
import { RadiusPicker } from '../../components/RadiusPicker'

interface Props {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

export function StepLocal({ draft, patch }: Props) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const located = draft.shareLocation && draft.localArea != null
  const count10 = useQueueCount(
    'local',
    located ? localQueueKey(draft.localCountryCode, draft.localArea as string, 10) : null,
  )
  const count50 = useQueueCount(
    'local',
    located ? localQueueKey(draft.localCountryCode, draft.localArea as string, 50) : null,
  )
  const count100 = useQueueCount(
    'local',
    located ? localQueueKey(draft.localCountryCode, draft.localArea as string, 100) : null,
  )
  const counts = located
    ? { 10: count10.count, 50: count50.count, 100: count100.count }
    : undefined

  async function locate() {
    setLocating(true)
    setError(null)
    try {
      const coords = await getCurrentPosition()
      const place = await reverseGeocode(coords)
      patch({
        coordinates: coords,
        localArea: place.slug,
        localLabel: place.label,
        localCountryCode: place.countryCode,
        shareLocation: true,
      })
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t determine your location.'))
      patch({ shareLocation: false, coordinates: null, localArea: null, localLabel: null, localCountryCode: null })
    } finally {
      setLocating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-on-surface">Your local area</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          You’ll only be matched with people within your chosen radius. Your exact coordinates are
          never shared with cluster members.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors',
            draft.shareLocation
              ? 'border-primary bg-primary-container/15 text-primary'
              : 'border-outline-variant/70 bg-surface text-on-surface hover:bg-surface-container',
          )}
        >
          {locating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <MapPin className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          )}
          {draft.shareLocation
            ? draft.localLabel
              ? draft.radiusKm != null
                ? `Within ${draft.radiusKm} km of ${draft.localLabel}`
                : `Near ${draft.localLabel}: choose a radius below`
              : 'Location shared'
            : locating
              ? 'Finding your location…'
              : 'Share my location'}
        </button>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        {!draft.shareLocation && !error && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Your browser will ask for permission. You will choose a radius next.
          </p>
        )}
        {draft.shareLocation && (
          <button
            type="button"
            disabled={locating}
            onClick={() =>
              patch({
                shareLocation: false,
                coordinates: null,
                localArea: null,
                localLabel: null,
                localCountryCode: null,
                radiusKm: null,
              })
            }
            className="mt-2 min-h-[44px] text-sm font-semibold text-error hover:underline disabled:opacity-60"
          >
            Remove location
          </button>
        )}
      </div>

      {draft.shareLocation && draft.localArea && (
        <RadiusPicker
          value={draft.radiusKm}
          onChange={(radiusKm) => patch({ radiusKm })}
          counts={counts}
        />
      )}
    </div>
  )
}
