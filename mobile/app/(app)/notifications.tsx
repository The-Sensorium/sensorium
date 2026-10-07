import { useState } from 'react'
import { router } from 'expo-router'
import {
  AtSign,
  Bell,
  CalendarDays,
  Flag,
  Heart,
  LockOpen,
  MailOpen,
  Megaphone,
  MessageCircle,
  MessageSquare,
  MessageSquareWarning,
  MoreHorizontal,
  PartyPopper,
  Scale,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import {
  timeAgo,
  useClearAllNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMyNotifications,
  type MyNotification,
  type NotificationType,
} from '../../src/features/notifications'
import { mobileTarget } from '../../src/lib/notification-routing'
import { useMyClusters } from '../../src/features/matching'
import { toErrorMessage } from '../../src/lib/error'
import { radii, shadowShape, spacing } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, ErrorText, LoadingView, PrimaryButton } from '../../src/components/ui'
import { Modal } from '../../src/components/Modal'
import { usePullToRefresh } from '../../src/lib/use-pull-to-refresh'
import { ActivityIndicator, FlatList, Modal as RNModal, Pressable, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const MEETUP_TYPES: ReadonlySet<NotificationType> = new Set([
  'meetup_invite',
  'meetup_confirmed',
  'meetup_reminder_24h',
  'meetup_reminder_15m',
  'meetup_starting',
])

const ICONS: Record<NotificationType, typeof Bell> = {
  message: MessageSquare,
  mention: AtSign,
  reaction: Heart,
  vote_started: Scale,
  vote_result: Scale,
  cluster_formed: PartyPopper,
  invitation_received: MailOpen,
  signal_new: Megaphone,
  replacement: UserPlus,
  unlocked: LockOpen,
  queue_update: Users,
  moderation_notice: ShieldCheck,
  post_comment: MessageCircle,
  post_like: Heart,
  report_new: Flag,
  appeal_new: MessageSquareWarning,
  meetup_invite: CalendarDays,
  meetup_confirmed: CalendarDays,
  meetup_reminder_24h: CalendarDays,
  meetup_reminder_15m: CalendarDays,
  meetup_starting: CalendarDays,
}

export default function NotificationsScreen() {
  const t = useTheme()
  const notifications = useMyNotifications()
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const clearAll = useClearAllNotifications()
  const queryClient = useQueryClient()
  const pull = usePullToRefresh([
    () => notifications.refetch(),
    () => queryClient.refetchQueries({ queryKey: ['notifications', 'unread'] }),
    // Meetup names resolve via clusters, but only when a meetup notification
    // exists. Guard like posts.tsx: refetch() on a disabled query runs its
    // queryFn, which would surface as a spurious failure.
    () => (items.some((n) => MEETUP_TYPES.has(n.type)) ? clusters.refetch() : Promise.resolve()),
  ])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const items = notifications.data ?? []
  const unread = items.filter((n) => n.read_at === null).length
  const visible = filter === 'unread' ? items.filter((n) => n.read_at === null) : items
  const markAllDisabled = items.length === 0 || markAll.isPending
  const clusters = useMyClusters(items.some((n) => MEETUP_TYPES.has(n.type)))
  const clusterNames = new Map(
    (clusters.data ?? []).map((c) => [c.cluster.id, c.cluster.name] as const),
  )
  function clusterNameFor(n: MyNotification): string | null {
    if (!MEETUP_TYPES.has(n.type) || !n.cluster_id) return null
    return clusterNames.get(n.cluster_id) ?? null
  }

  function handleClick(n: MyNotification) {
    if (n.read_at === null) {
      markRead.mutate(n.id)
    }
    const target = mobileTarget(n)
    if (target) router.push(target)
  }

  async function handleClear() {
    try {
      await clearAll.mutateAsync()
      setConfirmOpen(false)
      setMenuOpen(false)
    } catch {
      // Surfaced via clearAll.error inside the dialog; stay open to retry.
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: t.background }}>
      <FlatList
        data={visible}
        keyExtractor={(n) => n.id}
        windowSize={5}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        removeClippedSubviews={false}
        renderItem={({ item }) => (
          <NotificationRow item={item} clusterName={clusterNameFor(item)} onPress={() => handleClick(item)} />
        )}
        ListHeaderComponent={
          <>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 16 }}>
              <View>
                <Text style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">Notifications</Text>
                <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                  {unread > 0 ? `${unread} unread` : 'You’re all caught up'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => void markAll.mutateAsync()}
                  disabled={markAllDisabled}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: markAllDisabled }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, opacity: markAllDisabled ? 0.5 : 1 }}
                >
                  {markAll.isPending ? <ActivityIndicator size="small" color={t.onSurface} /> : null}
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Mark all read</Text>
                </Pressable>
                <Pressable
                  onPress={() => setMenuOpen(true)}
                  disabled={items.length === 0}
                  accessibilityLabel="More notification options"
                  accessibilityRole="button"
                  accessibilityState={{ expanded: menuOpen, disabled: items.length === 0 }}
                  hitSlop={8}
                  style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: t.outlineVariant, alignItems: 'center', justifyContent: 'center', opacity: items.length === 0 ? 0.5 : 1 }}
                >
                  <MoreHorizontal size={20} color={t.onSurface} strokeWidth={1.5} />
                </Pressable>
              </View>
            </View>
            {items.length > 0 ? (
              <View
                accessibilityLabel="Notification filter"
                style={{ flexDirection: 'row', borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, backgroundColor: t.surfaceLowest, padding: 4, marginBottom: 16 }}
              >
                <Pressable
                  onPress={() => setFilter('all')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === 'all' }}
                  style={{ flex: 1, borderRadius: radii.pill, backgroundColor: filter === 'all' ? t.primary : 'transparent', paddingVertical: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: filter === 'all' ? t.onPrimary : t.onSurfaceVariant }}>
                    All
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setFilter('unread')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: filter === 'unread' }}
                  style={{ flex: 1, borderRadius: radii.pill, backgroundColor: filter === 'unread' ? t.primary : 'transparent', paddingVertical: 12, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: filter === 'unread' ? t.onPrimary : t.onSurfaceVariant }}>
                    {unread > 0 ? `Unread · ${unread}` : 'Unread'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            <ErrorText message={notifications.isError ? null : pull.error} />
          </>
        }
        ListEmptyComponent={
          notifications.isLoading ? (
            <LoadingView />
          ) : notifications.isError ? (
            <Card>
              <View style={{ alignItems: 'center', padding: 16 }}>
                <Bell size={28} color={t.error} strokeWidth={1.5} />
                <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 16, lineHeight: 24, fontWeight: '600', color: t.error }}>
                  Couldn’t load your notifications
                </Text>
                <Text style={{ marginTop: 4, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
                  Something went wrong while fetching them. Please try again.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try loading notifications again"
                  hitSlop={8}
                  onPress={() => pull.onRefresh()}
                  style={{ marginTop: 4, paddingVertical: 8, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
                    Try again
                  </Text>
                </Pressable>
              </View>
            </Card>
          ) : items.length > 0 && visible.length === 0 ? (
            <Card plain>
              <View style={{ alignItems: 'center', padding: 16 }}>
                <Bell size={28} color={t.onSurfaceVariant} strokeWidth={1.5} />
                <Text style={{ marginTop: 12, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
                  You’re all caught up. Nothing unread right now.
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
        contentContainerStyle={{ flexGrow: 1, padding: spacing.containerMargin, paddingBottom: 24 }}
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
      <RNModal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close notification options"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          />
          <View
            accessibilityLabel="Notification options"
            style={{
              position: 'absolute',
              top: 110,
              right: 24,
              width: 248,
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
                setMenuOpen(false)
                setConfirmOpen(true)
              }}
              accessibilityLabel="Clear all notifications"
              accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, minHeight: 52 }}
            >
              <Trash2 size={18} color={t.error} strokeWidth={1.5} />
              <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600', color: t.error }}>
                Clear all notifications
              </Text>
            </Pressable>
          </View>
        </View>
      </RNModal>
      <Modal open={confirmOpen} onClose={() => { if (!clearAll.isPending) setConfirmOpen(false) }} title="Clear all notifications?">
        <Text style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
          This will permanently remove all notifications from your list. This action can't be undone.
        </Text>
        {clearAll.error ? (
          <Text accessibilityRole="alert" style={{ marginTop: 12, fontSize: 14, lineHeight: 20, color: t.error }}>
            {toErrorMessage(clearAll.error, 'Could not clear notifications. Please try again.')}
          </Text>
        ) : null}
        <View style={{ marginTop: 24, flexDirection: 'row', gap: 12 }}>
          <Pressable
            onPress={() => setConfirmOpen(false)}
            disabled={clearAll.isPending}
            accessibilityRole="button"
            style={{ flex: 1, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.pill, paddingVertical: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: clearAll.isPending ? 0.6 : 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <PrimaryButton
              title="Clear all"
              loadingTitle="Clearing…"
              loading={clearAll.isPending}
              tone="error"
              onPress={() => void handleClear()}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

function NotificationRow({
  item,
  clusterName,
  onPress,
}: {
  item: MyNotification
  clusterName: string | null
  onPress: () => void
}) {
  const t = useTheme()
  const Icon = ICONS[item.type] ?? Bell
  const isUnread = item.read_at === null
  const body = clusterName ? (item.body ? `${clusterName} · ${item.body}` : clusterName) : item.body
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        flexDirection: 'row',
        gap: 16,
        backgroundColor: isUnread ? t.surfaceContainer : t.surfaceLowest,
        borderRadius: radii.xl,
        padding: 16,
        marginBottom: 8,
        minHeight: 44,
      }}
    >
      <View
        style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: isUnread ? t.primary : t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon size={20} color={isUnread ? t.onPrimary : t.onSurfaceVariant} strokeWidth={1.5} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '600', color: t.onSurface }} numberOfLines={2} maxFontSizeMultiplier={1.4}>
            {item.title}
          </Text>
          <Text style={{ fontSize: 12, lineHeight: 16, color: t.onSurfaceVariant }} maxFontSizeMultiplier={1.4}>{timeAgo(item.created_at)}</Text>
        </View>
        {body ? (
          <Text style={{ marginTop: 2, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }} numberOfLines={2}>
            {body}
          </Text>
        ) : null}
      </View>
      {isUnread ? (
        <View style={{ marginTop: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.primary }} />
      ) : null}
    </Pressable>
  )
}
