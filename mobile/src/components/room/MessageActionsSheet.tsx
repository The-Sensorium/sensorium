import { useEffect, useRef, useState } from 'react'
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, CornerUpLeft, Copy, Flag, Info, Pencil, Plus, Trash2 } from 'lucide-react-native'
import { createEmojiPicker, FlatListEngine } from 'rn-expo-emoji-picker/flatlist'
import type { EmojiSelection } from 'rn-expo-emoji-picker/flatlist'
import { lightHaptic } from '../../lib/haptics'
import { radii } from '../../lib/theme-tokens'
import { useResolvedScheme } from '../../lib/theme-choice'
import { useTheme } from '../../lib/use-theme'
import { PreciseEmojiRow } from './PreciseEmojiRow'

const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

// Same FlatList engine and dataset as the default entry, but with per-emoji
// touch targets (see PreciseEmojiRow) so a tap can never land on a neighbor.
const FullEmojiPicker = createEmojiPicker(FlatListEngine, PreciseEmojiRow)

// Inline overlay instead of a native dialog. A native modal lives in a
// separate window and opening or closing it churns Android window insets,
// which snaps the inverted chat list back to the latest message. Rendering
// in the screen hierarchy leaves the list untouched.
export function MessageActionsSheet({
  open,
  mine,
  canEdit = true,
  canCopy = false,
  myReactionKeys,
  messageId,
  onClose,
  onToggleReaction,
  onCopy,
  onReply,
  onInfo,
  onEdit,
  onDelete,
  onReport,
}: {
  open: boolean
  mine: boolean
  canEdit?: boolean
  canCopy?: boolean
  myReactionKeys: ReadonlySet<string>
  messageId: string
  onClose: () => void
  onToggleReaction(messageId: string, emoji: string): void
  onCopy?: () => void
  onReply: () => void
  onInfo: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
}) {
  const t = useTheme()
  const scheme = useResolvedScheme()
  const { bottom } = useSafeAreaInsets()
  const [emojiOpen, setEmojiOpen] = useState(false)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) setEmojiOpen(false)
  }, [open])
  useEffect(() => {
    if (!open) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (emojiOpen) {
        setEmojiOpen(false)
        return true
      }
      closeRef.current()
      return true
    })
    return () => sub.remove()
  }, [open, emojiOpen ])
  if (!open) return null
  const handlePick = (selection: EmojiSelection) => {
    lightHaptic()
    onToggleReaction(messageId, selection.emoji)
    onClose()
  }
  return (
    <View style={styles.root} accessibilityViewIsModal>
      <Animated.View
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.backdrop}
      >
        <Pressable
          accessibilityLabel="Dismiss menu"
          onPress={() => {
            if (emojiOpen) setEmojiOpen(false)
            else onClose()
          }}
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
          {emojiOpen ? (
            <View accessibilityLabel="Choose a reaction">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to message actions"
                hitSlop={8}
                onPress={() => setEmojiOpen(false)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 12, minHeight: 48 }}
              >
                <ArrowLeft size={18} color={t.onSurface} strokeWidth={1.5} />
                <Text style={{ fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.onSurface }}>All reactions</Text>
              </Pressable>
              <View style={{ height: 360 }}>
                <FullEmojiPicker
                  onEmojiSelected={handlePick}
                  colorScheme={scheme}
                  storage={AsyncStorage}
                  enableSearch
                  enableRecentlyUsed
                  enableSkinToneSelector
                  categoryBarPosition="top"
                  theme={{
                    colors: {
                      background: t.surfaceLowest,
                      text: t.onSurface,
                      secondaryText: t.onSurfaceVariant,
                      accent: t.primary,
                      searchBackground: t.surfaceContainer,
                      searchText: t.onSurface,
                      searchPlaceholder: t.onSurfaceVariant,
                      divider: t.outlineVariant,
                      categoryBarBackground: t.surfaceLowest,
                      categoryActiveBackground: t.surfaceContainer,
                      overlayBackdrop: 'rgba(0,0,0,0.4)',
                      overlaySurface: t.surfaceLowest,
                    },
                  }}
                />
              </View>
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  backgroundColor: t.surfaceContainer,
                  borderRadius: radii.pill,
                  paddingHorizontal: 4,
                  paddingVertical: 8,
                  marginBottom: 4,
                }}
              >
                {QUICK_REACTION_EMOJIS.map((emoji) => {
                  const active = myReactionKeys.has(`${messageId}:${emoji}`)
                  return (
                    <Pressable
                      key={emoji}
                      accessibilityLabel={`React ${emoji}`}
                      hitSlop={4}
                      onPress={() => {
                        lightHaptic()
                        onToggleReaction(messageId, emoji)
                        onClose()
                      }}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? t.surfaceLowest : 'transparent',
                        borderWidth: active ? 1 : 0,
                        borderColor: t.primary,
                      }}
                    >
                      <Text style={{ fontSize: 20 }}>{emoji}</Text>
                    </Pressable>
                  )
                })}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More reactions"
                  accessibilityHint="Opens the full emoji picker"
                  hitSlop={4}
                  onPress={() => setEmojiOpen(true)}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.surfaceLowest,
                    borderWidth: 1,
                    borderColor: t.outlineVariant,
                  }}
                >
                  <Plus size={20} color={t.onSurface} strokeWidth={1.5} />
                </Pressable>
              </View>
              {canCopy && onCopy ? (
                <SheetRow label="Copy" onPress={onCopy}>
                  <Copy size={18} color={t.onSurface} strokeWidth={1.5} />
                </SheetRow>
              ) : null}
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
            </>
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
