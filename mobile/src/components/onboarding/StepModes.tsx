import { Pressable, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { MATCHING_MODES, type MatchingMode } from '../../lib/modes'
import type { OnboardingDraft } from '../../lib/onboarding-draft'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

export function StepModes({
  draft,
  patch,
}: {
  draft: OnboardingDraft
  patch: (updates: Partial<OnboardingDraft>) => void
}) {
  const t = useTheme()

  function toggle(mode: MatchingMode) {
    const selected = draft.selectedModes.includes(mode)
    patch({
      selectedModes: selected
        ? draft.selectedModes.filter((m) => m !== mode)
        : [...draft.selectedModes, mode],
    })
  }

  return (
    <View>
      <Text style={{ fontSize: 22, fontWeight: '600', color: t.onSurface }}>
        How do you want to match?
      </Text>
      <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant, marginBottom: 16 }}>
        Pick at least one. Each mode forms its own independent cluster.
      </Text>
      {MATCHING_MODES.map((mode) => {
        const active = draft.selectedModes.includes(mode.value)
        const Icon = mode.icon
        return (
          <Pressable
            key={mode.value}
            onPress={() => toggle(mode.value)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              borderWidth: 1,
              borderColor: active ? t.primary : t.outlineVariant,
              backgroundColor: active ? t.surfaceContainer : t.surface,
              borderRadius: radii.md,
              paddingHorizontal: 16,
              paddingVertical: 14,
              marginBottom: 12,
            }}
          >
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? t.primary : t.onSurfaceVariant,
                backgroundColor: active ? t.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {active ? <Check size={16} color={t.onPrimary} strokeWidth={2} /> : null}
            </View>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: t.surfaceContainer,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={20} color={t.primary} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>
                {mode.label}
              </Text>
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{mode.detail}</Text>
            </View>
          </Pressable>
        )
      })}
      <Text style={{ fontSize: 12, lineHeight: 20, color: t.onSurfaceVariant }}>
        Interest-based matching is intentionally not offered. Clusters are built around life stages
        and place, not shared hobbies.
      </Text>
    </View>
  )
}
