import { useEffect, useRef } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CornerUpLeft, Flag, Info, Pencil, Trash2 } from 'lucide-react-native'
import { lightHaptic } from '../../lib/haptics'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// Inline overlay instead of a native dialog. A native modal lives in a
// separate window and opening or closing it churns Android window insets,
// which snaps the inverted chat list back to the latest message. Rendering
// in the screen hierarchy leaves the list untouched.
export function MessageActionsSheet({
  open,
  mine,
  canEdit = true,
  myReactionKeys,
  messageId,
  onClose,
  onToggleReaction,
  onReply,
  onInfo,
  onEdit,
  onDelete,
  onReport,
}: {
  open: boolean
  mine: boolean
  canEdit?: boolean
  myReactionKeys: ReadonlySet<string>
  messageId: string
  onClose: () => void
  onToggleReaction(messageId: string, emoji: string): void
  onReply: () => void
  onInfo: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
}) {
  const t = useTheme()
  const { bottom } = useSafeAreaInsets()
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current()
      return true
    })
    return () => sub.remove()
  }, [open ])
  if (!open) return null
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(200)}
        exiting={SlideOutDown.duration(200)}
        accessibilityLabel="Message actions"
        style={[
          styles.panel,
          { backgroundColor: t.surfaceLowest, paddingBottom: bottom + 16 },
        ]}
      >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: t.outlineVariant,
              marginBottom: 8,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              backgroundColor: t.surfaceContainer,
              borderRadius: radii.pill,
              paddingHorizontal: 8,
              paddingVertical: 10,
              marginBottom: 4,
            }}
          >
            {REACTION_EMOJIS.map((emoji) => {
              const active = myReactionKeys.has(`${messageId}:${emoji}`)
              return (
                <Pressable
                  key={emoji}
                  accessibilityLabel={`React ${emoji}`}
                  onPress={() => {
                    lightHaptic()
                    onToggleReaction(messageId, emoji)
                    onClose()
                  }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: active ? t.surfaceLowest : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: t.primary,
                  }}
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </Pressable>
              )
            })}
          </View>
          <SheetRow label="Reply" onPress={onReply}>
            <CornerUpLeft size={18} color={t.onSurface} strokeWidth={1.5} />
          </SheetRow>
          {mine ? (
            <SheetRow label="Info" onPress={onInfo}>
              <Info size={18} color={t.onSurface} strokeWidth={1.5} />
            </SheetRow>
          ) : null}
          {mine && canEdit ? (
            <>
              <SheetRow label="Edit" onPress={onEdit}>
                <Pencil size={18} color={t.onSurface} strokeWidth={1.5} />
              </SheetRow>
              <SheetRow label="Delete" danger onPress={onDelete}>
                <Trash2 size={18} color={t.error} strokeWidth={1.5} />
              </SheetRow>
            </>
          ) : mine ? (
            <SheetRow label="Delete" danger onPress={onDelete}>
              <Trash2 size={18} color={t.error} strokeWidth={1.5} />
            </SheetRow>
          ) : (
            <SheetRow label="Report" danger onPress={onReport}>
              <Flag size={18} color={t.error} strokeWidth={1.5} />
            </SheetRow>
          )}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={{ marginTop: 8, backgroundColor: t.surfaceContainer, borderRadius: radii.md, paddingVertical: 14, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}
          >
            <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  panel: {
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
})

function SheetRow({
  label,
  danger,
  onPress,
  children,
}: {
  label: string
  danger?: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  const t = useTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 48 }}
    >
      {children}
      <Text style={{ fontSize: 16, lineHeight: 24, color: danger ? t.error : t.onSurface }}>{label}</Text>
    </Pressable>
  )
}
