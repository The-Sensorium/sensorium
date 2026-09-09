import { router } from 'expo-router'
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
  timeAgo,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  type MyNotification,
  type NotificationType,
} from '../../src/features/notifications'
import { mobileTarget } from '../../src/lib/notification-routing'
import { radii, spacing } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, ErrorText, LoadingView } from '../../src/components/ui'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={() => handleClick(item)} />}
        ListHeaderComponent={
          <>
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
          </>
        }
        ListEmptyComponent={
          notifications.isLoading ? (
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
          ) : (
            <Card plain>
              <View style={{ alignItems: 'center', padding: 16 }}>
                <Bell size={28} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ marginTop: 12, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
                  No notifications yet. Activity from your clusters will show up here.
                </Text>
              </View>
            </Card>
          )
        }
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, padding: spacing.containerMargin, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor={t.primary}
            colors={[t.primary]}
            progressBackgroundColor={t.surfaceContainer}
          />
        }
      />
    </SafeAreaView>
  )
}

function NotificationRow({ item, onPress }: { item: MyNotification; onPress: () => void }) {
  const t = useTheme()
  const Icon = ICONS[item.type] ?? Bell
  const isUnread = item.read_at === null
  return (
    <Pressable
      onPress={onPress}
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
            {item.title}
          </Text>
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>{timeAgo(item.created_at)}</Text>
        </View>
        {item.body ? (
          <Text style={{ marginTop: 2, fontSize: 14, color: t.onSurfaceVariant }} numberOfLines={2}>
            {item.body}
          </Text>
        ) : null}
      </View>
      {isUnread ? (
        <View style={{ marginTop: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} />
      ) : null}
    </Pressable>
  )
}
