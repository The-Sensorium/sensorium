import { ActivityIndicator, Modal as RNModal, Pressable, Text, View } from 'react-native'
import { Bell, BellOff, Check } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { activeDurationKey, mutedUntilCopy, MUTE_DURATIONS, type MuteDurationKey } from '../lib/cluster-mute'
import { radii } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

/**
 * Timed-mute picker as a bottom sheet. Chrome mirrors ConfirmSheet (backdrop,
 * handle, surface, cancel placement) so sheets feel identical across the app.
 */
export function MuteDurationSheet({
  open,
  onClose,
  clusterName,
  muted,
  mutedUntil,
  headerFill,
  headerOnFill,
  pendingKey,
  error,
  onSelect,
  onUnmute,
}: {
  open: boolean
  onClose: () => void
  clusterName: string
  muted: boolean
  mutedUntil: string | null
  headerFill: string
  headerOnFill: string
  pendingKey: MuteDurationKey | 'unmute' | null
  error: string | null
  onSelect: (key: MuteDurationKey) => void
  onUnmute: () => void
}) {
  const t = useTheme()
  const { bottom } = useSafeAreaInsets()
  const busy = pendingKey !== null
  const activeKey = activeDurationKey(mutedUntil)
  const title = muted ? 'Notifications muted' : 'Mute notifications'
  const subtitle = muted
    ? (mutedUntilCopy(clusterName, mutedUntil) ?? `${clusterName} notifications are muted.`)
    : `How long would you like to mute ${clusterName}?`

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
          accessibilityLabel={`Dismiss: ${title}`}
          onPress={onClose}
          disabled={busy}
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel={title}
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottom + 28,
            maxHeight: '90%',
          }}
        >
          <Pressable
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${title}`}
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{ alignSelf: 'stretch', minHeight: 48, justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: t.outlineVariant,
              }}
            />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: headerFill,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BellOff size={24} color={headerOnFill} strokeWidth={1.5} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
                {title}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                {subtitle}
              </Text>
            </View>
          </View>
          <View style={{ marginTop: 12 }}>
            {MUTE_DURATIONS.map((duration) => {
              const pending = pendingKey === duration.key
              return (
                <Pressable
                  key={duration.key}
                  disabled={busy}
                  onPress={() => onSelect(duration.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mute for ${duration.label}`}
                  accessibilityState={{ disabled: busy }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    minHeight: 52,
                    opacity: busy && !pending ? 0.6 : 1,
                  }}
                >
                  {pending ? (
                    <ActivityIndicator size="small" color={t.onSurface} />
                  ) : (
                    <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.onSurface }}>
                      {duration.label}
                    </Text>
                  )}
                  {activeKey === duration.key && !pending ? (
                    <Check size={20} color={t.primary} strokeWidth={2} />
                  ) : null}
                </Pressable>
              )
            })}
            {muted ? (
              <View>
                <View
                  style={{
                    height: 1,
                    backgroundColor: t.outlineVariant,
                    marginVertical: 8,
                  }}
                />
                <Pressable
                  disabled={busy}
                  onPress={onUnmute}
                  accessibilityRole="button"
                  accessibilityLabel="Unmute notifications"
                  accessibilityState={{ disabled: busy }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 16,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    minHeight: 52,
                    opacity: busy && pendingKey !== 'unmute' ? 0.6 : 1,
                  }}
                >
                  {pendingKey === 'unmute' ? (
                    <ActivityIndicator size="small" color={t.onSurface} />
                  ) : (
                    <Bell size={20} color={t.onSurface} strokeWidth={1.5} />
                  )}
                  <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.onSurface }}>
                    Unmute notifications
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, color: t.error }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{
              marginTop: 20,
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: t.surfaceHigh,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </RNModal>
  )
}
