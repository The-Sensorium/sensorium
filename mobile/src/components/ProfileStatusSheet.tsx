import { Modal as RNModal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check } from 'lucide-react-native'
import { PROFILE_STATUSES, type ProfileStatus } from '../lib/profile-status'
import { statusDotColor } from '../lib/status-dot'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { useResolvedScheme } from '../lib/theme-choice'

export function ProfileStatusSheet({
  open,
  current,
  onClose,
  onSelect,
}: {
  open: boolean
  current: ProfileStatus
  onClose: () => void
  onSelect: (value: ProfileStatus) => void
}) {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const { bottom } = useSafeAreaInsets()
  return (
    <RNModal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <Pressable
          accessibilityLabel="Dismiss status picker"
          onPress={onClose}
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel="Set your status"
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottom + 16,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.outlineVariant,
              marginBottom: 12,
            }}
          />
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '600', color: t.onSurface }}>
            Set your status
          </Text>
          <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
            Your status is visible to your cluster.
          </Text>
          <View style={{ marginTop: 16, gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Profile status">
            {PROFILE_STATUSES.map((status) => {
              const selected = status.value === current
              return (
                <Pressable
                  key={status.value}
                  onPress={() => onSelect(status.value)}
                  accessibilityRole="radio"
                  accessibilityLabel={`Set status to ${status.label}`}
                  accessibilityState={{ selected }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    borderWidth: 1,
                    borderColor: selected ? t.primary : t.outlineVariant,
                    backgroundColor: selected ? `${t.primary}29` : 'transparent',
                    borderRadius: radii.lg,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    minHeight: 64,
                  }}
                >
                  <View
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      backgroundColor: statusDotColor(status.value, scheme === 'dark'),
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: t.onSurface }}>
                      {status.label}
                    </Text>
                    <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                      {status.description}
                    </Text>
                  </View>
                  {selected ? (
                    <Check size={20} color={t.primary} strokeWidth={2} />
                  ) : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      </View>
    </RNModal>
  )
}
