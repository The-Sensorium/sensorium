import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { MapPin } from 'lucide-react-native'
import { getCurrentPosition, reverseGeocode } from '../../lib/geo'
import { toErrorMessage } from '../../lib/error'
import { LOCAL_RADII, type LocalRadius, type OnboardingDraft } from '../../lib/onboarding-draft'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

export function StepLocal({
  draft,
  patch,
}: {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}) {
  const t = useTheme()
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
    <View>
      <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>Your local area</Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        You’ll only be matched with people within your chosen radius. Your exact coordinates are
        never shared with cluster members.
      </Text>

      <Pressable
        onPress={locate}
        disabled={locating}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: draft.shareLocation ? t.primary : t.outlineVariant,
          backgroundColor: draft.shareLocation ? t.surfaceContainer : t.surface,
          borderRadius: radii.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {locating ? (
          <ActivityIndicator size="small" color={t.primary} />
        ) : (
          <MapPin size={16} color={draft.shareLocation ? t.primary : t.onSurface} strokeWidth={1.5} />
        )}
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: draft.shareLocation ? t.primary : t.onSurface,
          }}
        >
          {draft.shareLocation
            ? draft.localLabel
              ? `Within ${draft.radiusKm ?? '-'} km of ${draft.localLabel}`
              : 'Location shared'
            : locating
              ? 'Finding your location…'
              : 'Share my location'}
        </Text>
      </Pressable>
      {error ? (
        <Text style={{ marginTop: 8, fontSize: 14, color: t.error }}>{error}</Text>
      ) : !draft.shareLocation ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: t.onSurfaceVariant }}>
          Your phone will ask for permission. You can adjust the radius below.
        </Text>
      ) : null}

      <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '600', color: t.onSurface }}>
        Matching radius
      </Text>
      <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
        {LOCAL_RADII.map((radius) => {
          const active = draft.radiusKm === radius
          return (
            <Pressable
              key={radius}
              onPress={() => patch({ radiusKm: radius as LocalRadius })}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: active ? t.primary : t.outlineVariant,
                backgroundColor: active ? t.primary : 'transparent',
                borderRadius: radii.pill,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: '600', color: active ? t.onPrimary : t.onSurface }}
              >
                {radius} km
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
