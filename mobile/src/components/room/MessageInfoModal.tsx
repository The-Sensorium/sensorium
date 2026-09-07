import { Text, View } from 'react-native'
import { CheckCheck } from 'lucide-react-native'
import { Modal } from '../Modal'
import { Avatar } from '../Avatar'
import { dateTimeFormatter } from './format'
import type { SeenByMember } from './seen-by'
import { useTheme } from '../../lib/use-theme'

function MemberList({ members, empty }: { members: SeenByMember[]; empty: string }) {
  const t = useTheme()
  if (members.length === 0) {
    return <Text style={{ fontSize: 14, color: t.onSurfaceVariant }}>{empty}</Text>
  }
  return (
    <View style={{ gap: 8 }}>
      {members.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar name={m.display_name} src={m.avatar_url} size={32} />
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
}: {
  open: boolean
  onClose(): void
  seen: SeenByMember[]
  notSeen: SeenByMember[]
}) {
  const t = useTheme()
  return (
    <Modal open={open} onClose={onClose} title="Message info">
      <View style={{ marginTop: 16, gap: 16 }}>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
            Seen by
          </Text>
          <MemberList members={seen} empty="No one has seen it yet." />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, color: t.onSurfaceVariant }}>
            Not seen yet
          </Text>
          <MemberList members={notSeen} empty="Everyone has seen it." />
        </View>
      </View>
    </Modal>
  )
}
