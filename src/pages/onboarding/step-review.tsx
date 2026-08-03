import { countryName } from '../../lib/countries'
import { modeInfo } from '../../lib/modes'
import { ageOnDate, type OnboardingDraft } from './draft'

interface Props {
  draft: OnboardingDraft
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-on-surface-variant">{label}</dt>
      <dd className="text-right text-sm font-medium text-on-surface">{value}</dd>
    </div>
  )
}

export function StepReview({ draft }: Props) {
  const age = draft.dob ? ageOnDate(draft.dob) : null
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-on-surface">Review &amp; join</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Everything looks right? Joining a queue is instant and free.
        </p>
      </div>

      <dl className="divide-y divide-outline-variant/60 rounded-xl bg-surface px-5">
        <Row label="Display name" value={draft.displayName.trim()} />
        <Row
          label="Date of birth"
          value={age !== null ? `${draft.dob} (age ${age})` : draft.dob}
        />
        <Row label="Country" value={countryName(draft.countryCode)} />
        {draft.bio.trim() && <Row label="Bio" value={draft.bio.trim()} />}
        <Row
          label="Matching modes"
          value={draft.selectedModes.map((m) => modeInfo(m).label).join(', ')}
        />
        {draft.selectedModes.includes('local') && (
          <Row
            label="Local radius"
            value={draft.radiusKm && draft.localLabel ? `Within ${draft.radiusKm} km of ${draft.localLabel}` : ''}
          />
        )}
      </dl>
    </div>
  )
}
