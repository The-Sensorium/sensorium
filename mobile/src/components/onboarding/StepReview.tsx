import { Text, View } from 'react-native'
import { countryName } from '../../lib/countries'
import { modeInfo } from '../../lib/modes'
import { ageOnDate, type OnboardingDraft } from '../../lib/onboarding-draft'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme()
  if (!value) return null
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
        paddingVertical: 10,
      }}
    >
      <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{label}</Text>
      <Text style={{ flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '500', color: t.onSurface }}>
        {value}
      </Text>
    </View>
  )
}

export function StepReview({ draft }: { draft: OnboardingDraft }) {
  const t = useTheme()
  const age = draft.dob ? ageOnDate(draft.dob) : null

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>Review &amp; join</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Everything looks right? Joining a queue is instant and free.
      </Text>
      <View style={{ backgroundColor: t.surface, borderRadius: radii.md, paddingHorizontal: 20 }}>
        <Row label="Display name" value={draft.displayName.trim()} />
        <Row label="Pronouns" value={draft.pronouns.trim()} />
        <Row
          label="Date of birth"
          value={age !== null && age >= 0 ? `${draft.dob} (age ${age})` : draft.dob}
        />
        <Row label="Country" value={countryName(draft.countryCode)} />
        <Row label="Bio" value={draft.bio.trim()} />
        <Row
          label="Matching modes"
          value={draft.selectedModes.map((m) => modeInfo(m).label).join(', ')}
        />
        {draft.selectedModes.includes('local') ? (
          <Row
            label="Local radius"
            value={
              draft.radiusKm && draft.localLabel
                ? `Within ${draft.radiusKm} km of ${draft.localLabel}`
                : ''
            }
          />
        ) : null}
      </View>
    </View>
  )
}
