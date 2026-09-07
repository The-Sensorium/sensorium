import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { Megaphone, Scale } from 'lucide-react-native'
import { DayDivider } from './DayDivider'
import { dateTimeFormatter } from './format'
import { Avatar } from '../Avatar'
import { CountdownTimer } from '../CountdownTimer'
import type { Signal, SignalStatus } from '../../features/signals'
import type { Vote } from '../../features/votes'
import { radii } from '../../lib/theme-tokens'
import { useTheme } from '../../lib/use-theme'

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
          gap: 10,
          backgroundColor: t.surfaceContainer,
          borderRadius: radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View style={{ marginTop: 2 }}>
          {author?.avatar_url ? (
            <Avatar name={author?.display_name ?? 'Member'} src={author.avatar_url} size={24} />
          ) : (
            <View
              style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.tertiaryContainer, alignItems: 'center', justifyContent: 'center' }}
            >
              <Megaphone size={14} color={t.tertiary} strokeWidth={2} />
            </View>
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurface }} numberOfLines={2}>
            {signal.prompt}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: t.onSurfaceVariant }}>
            {author?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(signal.created_at))} ·{' '}
            <Text style={{ fontWeight: '600', color: t[SIGNAL_STATUS[signal.status].colorKey] }}>{SIGNAL_STATUS[signal.status].label}</Text>
            {' '}· {replyCount} replies
          </Text>
        </View>
      </Pressable>
      </Link>
    </View>
  )
}

const VOTE_TYPE_LABEL: Record<Vote['type'], string> = {
  replace_member: 'Replace a member',
  change_name: 'Rename the cluster',
  select_candidate: 'Choose a new member',
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
          gap: 10,
          backgroundColor: t.surfaceContainer,
          borderRadius: radii.md,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{ marginTop: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}
        >
          <Scale size={14} color={t.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: t.onSurface }} numberOfLines={2}>
            {VOTE_TYPE_LABEL[vote.type]}: {title}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 12, color: t.onSurfaceVariant }}>
            {initiator?.display_name ?? 'Member'}
            {isMine ? ' (you)' : ''} · {dateTimeFormatter.format(new Date(vote.created_at))} · Ends in{' '}
            <CountdownTimer deadline={vote.closes_at} />
          </Text>
        </View>
      </Pressable>
      </Link>
    </View>
  )
}
