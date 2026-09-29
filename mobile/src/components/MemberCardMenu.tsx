import { Dimensions, Modal, Pressable, Text, View, type GestureResponderEvent } from 'react-native'
import { router } from 'expo-router'
import { Flag, MoreVertical, User } from 'lucide-react-native'
import { MuteButton } from './MuteButton'
import { radii, shadowShape } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

const MENU_WIDTH = 208
const MENU_ITEM_HEIGHT = 52
const MENU_PADDING = 16

export type MemberMenuTarget = { id: string; name: string; x: number; y: number }

function menuPosition(x: number, y: number, itemCount: number) {
  const { width: windowWidth, height: windowHeight } = Dimensions.get('window')
  const menuHeight = itemCount * MENU_ITEM_HEIGHT + MENU_PADDING
  const left = Math.min(Math.max(8, x - MENU_WIDTH + 32), Math.max(8, windowWidth - MENU_WIDTH - 8))
  const below = y + 8
  const top = Math.max(16, below + menuHeight > windowHeight - 16 ? y - menuHeight - 8 : below)
  return { left, top }
}

export function MemberMenuButton({
  member,
  onOpen,
}: {
  member: { id: string; display_name: string }
  onOpen: (target: MemberMenuTarget) => void
}) {
  const t = useTheme()

  function handlePress(e: GestureResponderEvent) {
    const { pageX, pageY } = e.nativeEvent
    onOpen({
      id: member.id,
      name: member.display_name,
      x: typeof pageX === 'number' ? pageX : Dimensions.get('window').width - 40,
      y: typeof pageY === 'number' ? pageY : 120,
    })
  }

  return (
    <Pressable
      onPress={handlePress}
      accessibilityLabel={`Member options for ${member.display_name}`}
      accessibilityRole="button"
      hitSlop={8}
      style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
    >
      <MoreVertical size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
    </Pressable>
  )
}

export function MemberMenuPopover({
  target,
  clusterId,
  isSelf,
  onClose,
  onReport,
}: {
  target: MemberMenuTarget | null
  clusterId: string
  isSelf: boolean
  onClose: () => void
  onReport: (target: { id: string; name: string }) => void
}) {
  const t = useTheme()
  if (!target) return null
  const itemCount = isSelf ? 1 : 3
  const { left, top } = menuPosition(target.x, target.y, itemCount)

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          accessibilityLabel="Close member menu"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel={`Options for ${target.name}`}
          style={{
            position: 'absolute',
            left,
            top,
            width: MENU_WIDTH,
            backgroundColor: t.surfaceLowest,
            borderWidth: 1,
            borderColor: t.outlineVariant,
            borderRadius: radii.xl,
            padding: 8,
            ...shadowShape,
            shadowColor: t.shadowColor,
          }}
        >
          <Pressable
            onPress={() => {
              onClose()
              router.push({ pathname: '/profile/[userId]', params: { userId: target.id, cluster: clusterId } })
            }}
            accessibilityLabel={`View ${target.name}'s profile`}
            accessibilityRole="button"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 }}
          >
            <User size={18} color={t.onSurface} strokeWidth={1.5} />
            <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.onSurface }}>
              View profile
            </Text>
          </Pressable>
          {!isSelf ? (
            <>
              <View style={{ height: 1, marginHorizontal: 12, backgroundColor: t.outlineVariant, opacity: 0.4 }} />
              <MuteButton
                targetUserId={target.id}
                targetName={target.name}
                menuItem
                onDialogClose={onClose}
              />
            </>
          ) : null}
          {!isSelf ? (
            <>
              <View style={{ height: 1, marginHorizontal: 12, backgroundColor: t.outlineVariant, opacity: 0.4 }} />
              <Pressable
              onPress={() => onReport({ id: target.id, name: target.name })}
              accessibilityLabel={`Report ${target.name}`}
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 }}
            >
              <Flag size={18} color={t.onSurface} strokeWidth={1.5} />
              <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.onSurface }}>
                Report
              </Text>
            </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
