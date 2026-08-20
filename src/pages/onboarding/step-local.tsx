import { useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { cn } from '../../lib/utils'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { toErrorMessage } from '../../lib/error'
import { LOCAL_RADII, type LocalRadius, type OnboardingDraft } from './draft'

interface Props {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

export function StepLocal({ draft, patch }: Props) {
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        shareLocation: true,
      })
    } catch (err) {
      setError(toErrorMessage(err, 'Couldn’t determine your location.'))
      patch({ shareLocation: false, coordinates: null, localArea: null, localLabel: null })
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
              ? `Within ${draft.radiusKm ?? '-'} km of ${draft.localLabel}`
              : 'Location shared'
            : locating
              ? 'Finding your location…'
              : 'Share my location'}
        </button>
        {error && <p className="mt-2 text-sm text-error">{error}</p>}
        {!draft.shareLocation && !error && (
          <p className="mt-2 text-xs text-on-surface-variant">
            Your browser will ask for permission. You can adjust the radius below.
          </p>
        )}
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-on-surface">Matching radius</legend>
        <div className="mt-2 flex gap-2">
          {LOCAL_RADII.map((radius) => (
            <button
              key={radius}
              type="button"
              aria-pressed={draft.radiusKm === radius}
              onClick={() => patch({ radiusKm: radius as LocalRadius })}
              className={cn(
                'flex-1 rounded-pill border px-4 py-2.5 text-sm font-semibold transition-colors',
                draft.radiusKm === radius
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-outline-variant/70 text-on-surface hover:bg-surface-container',
              )}
            >
              {radius} km
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
