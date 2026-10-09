import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { ChevronRight, Megaphone, Scale } from 'lucide-react-native'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
import { Avatar } from '../Avatar'
import { CountdownTimer } from '../CountdownTimer'
import type { Signal, SignalStatus } from '../../features/signals'
import type { Vote } from '../../features/votes'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'
import { useClusterAccentText } from '../../lib/cluster-theme'

const SIGNAL_STATUS: Record<SignalStatus, { label: string; colorKey: 'primary' | 'tertiary' | 'onSurfaceVariant' }> = {
  open: { label: 'Open', colorKey: 'primary' },
  in_progress: { label: 'In progress', colorKey: 'tertiary' },
  resolved: { label: 'Resolved', colorKey: 'onSurfaceVariant' },
}

export function SignalRow({
  signal,
  author,
  isMine,
  replyCount,
  clusterId,
  showDay,
}: {
  signal: Signal
  author: { display_name: string; avatar_url: string | null } | undefined
  isMine: boolean
  replyCount: number
  clusterId: string
  showDay: boolean
}) {
  const t = useTheme()
  const accentText = useClusterAccentText() ?? t.primary
  const statusColor = SIGNAL_STATUS[signal.status].colorKey === 'primary' ? accentText : t[SIGNAL_STATUS[signal.status].colorKey]
  return (
    <View>
      {showDay ? <DayDivider iso={signal.created_at} /> : null}
      <Link
        href={{ pathname: '/cluster/[clusterId]/signals/[signalId]', params: { clusterId, signalId: signal.id } }}
        asChild
      >
      <Pressable
        style={{
          marginVertical: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: t.surfaceContainer,
          borderRadius: radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View>
          {author?.avatar_url ? (
            <Avatar name={author?.display_name ?? 'Member'} src={author.avatar_url} size={24} />
          ) : (
            <View
              style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Megaphone size={14} color={t.tertiary} strokeWidth={2} />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }} numberOfLines={2}>
            {signal.prompt}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
            {author?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(signal.created_at))}
          </Text>
          <Text style={{ marginTop: 2, fontSize: 12, color: t.onSurfaceVariant }}>
            {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: t.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: statusColor }}>
              {SIGNAL_STATUS[signal.status].label}
            </Text>
          </View>
          <ChevronRight size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        </View>
      </Pressable>
      </Link>
    </View>
  )
}

export function VoteRow({
  vote,
  initiator,
  target,
  isMine,
  clusterId,
  showDay,
}: {
  vote: Vote
  initiator: { display_name: string; avatar_url: string | null } | undefined
  target: { display_name: string; avatar_url: string | null } | undefined
  isMine: boolean
  clusterId: string
  showDay: boolean
}) {
  const t = useTheme()
  const title =
    vote.type === 'change_name'
      ? `Rename to "${vote.name_suggestion ?? '?'}"`
      : vote.type === 'replace_member'
        ? `Replace ${target?.display_name ?? 'a member'}`
        : 'Choose a new member'
  const isOpen = vote.status === 'open'
  return (
    <View>
      {showDay ? <DayDivider iso={vote.created_at} /> : null}
      <Link
        href={{ pathname: '/cluster/[clusterId]/votes', params: { clusterId } }}
        asChild
      >
      <Pressable
        style={{
          marginVertical: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: t.surfaceContainer,
          borderRadius: radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Scale size={14} color={t.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }} numberOfLines={2}>
            {title}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: t.onSurfaceVariant }} numberOfLines={1}>
            {initiator?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(vote.created_at))}
          </Text>
          {isOpen ? (
            <Text style={{ marginTop: 2, fontSize: 12, color: t.onSurfaceVariant }}>
              Ends in <CountdownTimer deadline={vote.closes_at} />
            </Text>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ backgroundColor: t.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '500', color: isOpen ? t.primary : t.onSurfaceVariant }}>
              {isOpen ? 'Open' : 'Closed'}
            </Text>
          </View>
          <ChevronRight size={16} color={t.onSurfaceVariant} strokeWidth={1.5} />
        </View>
      </Pressable>
      </Link>
    </View>
  )
}
