import { router, type Href } from 'expo-router'
import {
  AtSign,
  Bell,
  Flag,
  Gavel,
  Heart,
  LifeBuoy,
  LockOpen,
  MailOpen,
  MessageCircle,
  MessageSquare,
  MessageSquareWarning,
  PartyPopper,
  ShieldCheck,
  UserPlus,
  Users,
  Vote,
} from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import {
  notificationTarget,
  timeAgo,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  type MyNotification,
  type NotificationType,
} from '../../src/features/notifications'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, Screen } from '../../src/components/ui'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

const ICONS: Record<NotificationType, typeof Bell> = {
  message: MessageSquare,
  mention: AtSign,
  reaction: Heart,
  vote_started: Vote,
  vote_result: Gavel,
  cluster_formed: PartyPopper,
  invitation_received: MailOpen,
  signal_new: LifeBuoy,
  replacement: UserPlus,
  unlocked: LockOpen,
  queue_update: Users,
  moderation_notice: ShieldCheck,
  post_comment: MessageCircle,
  post_like: Heart,
  report_new: Flag,
  appeal_new: MessageSquareWarning,
}

function mobileTarget(n: MyNotification): Href | null {
  const target = notificationTarget(n)
  if (!target) return null
  const to = target.to
  if (to.startsWith('/posts/')) {
    return { pathname: '/posts/[postId]', params: { postId: to.slice('/posts/'.length) } }
  }
  if (to.startsWith('/cluster/')) {
    const rest = to.slice('/cluster/'.length)
    const [clusterId, ...tail] = rest.split('/')
    if (tail[0] === 'signals' && tail[1]) {
      return { pathname: '/cluster/[clusterId]/signals/[signalId]', params: { clusterId, signalId: tail[1] } }
    }
    if (tail[0] === 'signals') {
      return { pathname: '/cluster/[clusterId]/signals', params: { clusterId } }
    }
    if (tail[0] === 'votes') {
      return { pathname: '/cluster/[clusterId]/votes', params: { clusterId } }
    }
    if (tail[0] === 'introductions') {
      return { pathname: '/cluster/[clusterId]/introductions', params: { clusterId } }
    }
    if (tail[0] === 'members') {
      return { pathname: '/cluster/[clusterId]/members', params: { clusterId } }
    }
    return { pathname: '/cluster/[clusterId]/room', params: { clusterId } }
  }
  if (to === '/home') return '/(app)/home'
  if (to === '/clusters') return '/(app)/clusters'
  if (to === '/cluster-created') return '/cluster-created'
  return null
}

export default function NotificationsScreen() {
  const t = useTheme()
  const notifications = useMyNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const queryClient = useQueryClient()
  const pull = usePullToRefresh([
    () => notifications.refetch(),
    () => queryClient.refetchQueries({ queryKey: ['notifications', 'unread'] }),
  ])

  const items = notifications.data ?? []
  const unread = items.filter((n) => n.read_at === null).length

  function handleClick(n: MyNotification) {
    if (n.read_at === null) {
      markRead.mutate(n.id)
    }
    const target = mobileTarget(n)
    if (target) router.push(target)
  }

  return (
    <Screen onRefresh={pull.onRefresh} refreshing={pull.refreshing}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
        <View>
          <Text style={{ fontSize: 28, fontWeight: '600', color: t.onSurface }}>Notifications</Text>
          <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
            {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
          </Text>
        </View>
        <Pressable
          onPress={() => void markAll.mutateAsync()}
          disabled={unread === 0 || markAll.isPending}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 10, opacity: unread === 0 || markAll.isPending ? 0.5 : 1 }}
        >
          {markAll.isPending ? <ActivityIndicator size="small" color={t.onSurface} /> : null}
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Mark all read</Text>
        </Pressable>
      </View>
      <ErrorText message={pull.error} />

      {notifications.isLoading ? (
        <LoadingView />
      ) : notifications.isError ? (
        <Card>
          <View style={{ alignItems: 'center', padding: 16 }}>
            <Bell size={28} color={t.error} strokeWidth={1.5} />
            <Text style={{ marginTop: 12, fontSize: 14, fontWeight: '600', color: t.error }}>
              Couldn’t load your notifications
            </Text>
            <Text style={{ marginTop: 4, fontSize: 14, color: t.onSurfaceVariant }}>
              Something went wrong while fetching them. Please try again.
            </Text>
          </View>
        </Card>
      ) : items.length === 0 ? (
        <Card plain>
          <View style={{ alignItems: 'center', padding: 16 }}>
            <Bell size={28} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ marginTop: 12, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
              No notifications yet. Activity from your clusters will show up here.
            </Text>
          </View>
        </Card>
      ) : (
        items.map((n) => {
          const Icon = ICONS[n.type] ?? Bell
          const isUnread = n.read_at === null
          return (
            <Pressable
              key={n.id}
              onPress={() => handleClick(n)}
              style={{
                flexDirection: 'row',
                gap: 16,
                backgroundColor: isUnread ? t.surfaceContainer : t.surfaceLowest,
                borderRadius: radii.xl,
                padding: 16,
                marginBottom: 8,
              }}
            >
              <View
                style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isUnread ? t.primary : t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon size={20} color={isUnread ? t.onPrimary : t.onSurfaceVariant} strokeWidth={1.5} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                    {n.title}
                  </Text>
                  <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{timeAgo(n.created_at)}</Text>
                </View>
                {n.body ? (
                  <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={2}>
                    {n.body}
                  </Text>
                ) : null}
              </View>
              {isUnread ? (
                <View style={{ marginTop: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} />
              ) : null}
            </Pressable>
          )
        })
      )}
    </Screen>
  )
}
