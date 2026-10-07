import { useEffect, useRef } from 'react'
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CheckCheck, X } from 'lucide-react-native'
import { radii } from '../../lib/theme-tokens'
import { AvatarLink } from '../AvatarLink'
import { dateTimeFormatter } from './format'
import type { SeenByMember } from './seen-by'
import { useTheme } from '../../lib/use-theme'

function MemberList({
  members,
  empty,
  clusterId,
}: {
  members: SeenByMember[]
  empty: string
  clusterId: string
}) {
  const t = useTheme()
  if (members.length === 0) {
    return <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{empty}</Text>
  }
  return (
    <View style={{ gap: 8 }}>
      {members.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <AvatarLink userId={m.id} clusterId={clusterId} name={m.display_name} src={m.avatar_url} size={32} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
            {m.display_name}
          </Text>
          {m.read_at ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CheckCheck size={14} color={t.primary} strokeWidth={2} />
              <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                {dateTimeFormatter.format(new Date(m.read_at))}
              </Text>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  )
}

// Inline overlay instead of a native dialog. A native modal lives in a
// separate window and opening or closing it churns Android window insets,
// which snaps the inverted chat list back to the latest message. Rendering
// in the screen hierarchy leaves the list untouched.
export function MessageInfoModal({
  open,
  onClose,
  seen,
  notSeen,
  clusterId,
  sentAt,
  showReads = true,
}: {
  open: boolean
  onClose(): void
  seen: SeenByMember[]
  notSeen: SeenByMember[]
  clusterId: string
  sentAt: string | null
  showReads?: boolean
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
          accessibilityLabel="Close message info"
          onPress={onClose}
          style={{ flex: 1 }}
        />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.duration(200)}
        exiting={SlideOutDown.duration(200)}
        accessibilityLabel="Message info"
        style={[
          styles.panel,
          { backgroundColor: t.surfaceLowest, paddingBottom: bottom + 16 },
        ]}
      >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close message info"
            hitSlop={{ top: 0, bottom: 0, left: 8, right: 8 }}
            style={{ alignSelf: 'stretch', minHeight: 48, justifyContent: 'center' }}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
              Message info
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close message info"
              hitSlop={8}
              style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1, marginTop: 16 }}
            contentContainerStyle={{ gap: 16, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {sentAt ? (
              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                  Sent
                </Text>
                <Text style={{ fontSize: 14, color: t.onSurface }}>
                  {dateTimeFormatter.format(new Date(sentAt))}
                </Text>
              </View>
            ) : null}
            {showReads ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                Seen by
              </Text>
              <MemberList members={seen} empty="No one has seen it yet." clusterId={clusterId} />
            </View>
            ) : null}
            {showReads ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                Not seen yet
              </Text>
              <MemberList members={notSeen} empty="Everyone has seen it." clusterId={clusterId} />
            </View>
            ) : null}
          </ScrollView>
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
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: '80%',
  },
})
