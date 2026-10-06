import { Modal as RNModal, Pressable, ScrollView, Text, View } from 'react-native'
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

export function MessageInfoModal({
  open,
  onClose,
  seen,
  notSeen,
  clusterId,
}: {
  open: boolean
  onClose(): void
  seen: SeenByMember[]
  notSeen: SeenByMember[]
  clusterId: string
}) {
  const t = useTheme()
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
          accessibilityLabel="Close message info"
          onPress={onClose}
          style={{ position: 'absolute', start: 0, end: 0, top: 0, bottom: 0 }}
        />
        <View
          accessibilityLabel="Message info"
          style={{
            backgroundColor: t.surfaceLowest,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: bottom + 16,
            maxHeight: '80%',
          }}
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
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                Seen by
              </Text>
              <MemberList members={seen} empty="No one has seen it yet." clusterId={clusterId} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
                Not seen yet
              </Text>
              <MemberList members={notSeen} empty="Everyone has seen it." clusterId={clusterId} />
            </View>
          </ScrollView>
        </View>
      </View>
    </RNModal>
  )
}
