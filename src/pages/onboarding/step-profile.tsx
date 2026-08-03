import { COUNTRIES } from '../../lib/countries'
import { MIN_AGE, type OnboardingDraft } from './draft'

interface Props {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}

function todayMinus18Years(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - MIN_AGE)
  return d.toISOString().slice(0, 10)
}

export function StepProfile({ draft, patch }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold text-on-surface">Tell us about yourself</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          This is how you’ll appear to the people in your clusters.
        </p>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-on-surface">Display name</span>
        <input
          type="text"
          value={draft.displayName}
          onChange={(e) => patch({ displayName: e.target.value })}
          maxLength={60}
          placeholder="How should people call you?"
          className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-on-surface">Date of birth</span>
        <input
          type="date"
          value={draft.dob}
          max={todayMinus18Years()}
          onChange={(e) => patch({ dob: e.target.value })}
          className="mt-1.5 w-full rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="mt-1.5 block text-xs text-on-surface-variant">
          You must be at least {MIN_AGE}. Your date of birth can’t be changed later. Only your birth
          year is ever shown to cluster members.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-on-surface">Country</span>
        <select
          value={draft.countryCode}
          onChange={(e) => patch({ countryCode: e.target.value })}
          className="mt-1.5 w-full appearance-none rounded-lg border border-outline-variant/70 bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Select your country…</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
