import { useEffect } from 'react'
import { router, Tabs } from 'expo-router'
import { Bell, Home, Newspaper, Settings, Users } from 'lucide-react-native'
import { useAuth } from '../../src/auth-context'
import { useNotificationsChannel, useUnreadCount } from '../../src/features/notifications'
import { useActiveAccountGate } from '../../src/lib/use-active-account'
import { useTheme } from '../../src/lib/use-theme'
import { onPushResponse, getLaunchPushData, syncBadgeCount, clearClusterPushNotifications } from '../../src/lib/push'
import { pushClusterId } from '../../src/lib/push-suppress'
import { badgeLabel } from '../../src/lib/tab-badge'
import { pushDataToHref, type PushData } from '../../src/lib/notification-routing'

function handlePushTap(data: PushData) {
  const clusterId = pushClusterId(data)
  if (clusterId) void clearClusterPushNotifications(clusterId)
  const target = pushDataToHref(data)
  if (target) router.push(target)
}

export default function AppTabs() {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  useActiveAccountGate('member')
  useNotificationsChannel(userId)
  const unread = useUnreadCount()
  const unreadCount = unread.data ?? 0
  const badge = badgeLabel(unreadCount)
  useEffect(() => {
    void syncBadgeCount(unread.data ?? 0)
  }, [unread.data])
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void onPushResponse((data) => {
      handlePushTap(data as PushData)
    }).then((fn) => {
      if (disposed) fn()
      else unsubscribe = fn
    })
    // A tap that cold-starts a terminated app is not delivered through the
    // listener above; it must be read once at startup.
    void getLaunchPushData().then((data) => {
      if (!disposed && data) handlePushTap(data as PushData)
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])
  return (
    <Tabs
      // Hidden screens (room, post detail, profile…) are tab routes, not
      // stack pushes, so the default 'firstRoute' back behavior drops users
      // on Home. 'history' walks the actual visit trail instead, so back
      // from a cluster room returns to the cluster list it came from.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.onSurfaceVariant,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.outlineVariant },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        tabBarBadgeStyle: { backgroundColor: t.error, color: t.onError, fontSize: 11, fontWeight: '600', minWidth: 18, height: 18, borderRadius: 9, lineHeight: 16, textAlign: 'center' },
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="posts"
        options={{
          title: 'Posts',
          tabBarIcon: ({ color, size }) => <Newspaper size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          tabBarBadge: badge,
          tabBarIcon: ({ color, size }) => <Bell size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="clusters"
        options={{
          title: 'Clusters',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} strokeWidth={1.5} />,
        }}
      />
      <Tabs.Screen name="mode/[modeId]" options={{ href: null }} />
      <Tabs.Screen name="queue/[queueId]" options={{ href: null }} />
      <Tabs.Screen name="cluster-created" options={{ href: null }} />
      <Tabs.Screen name="cluster/[clusterId]/introductions" options={{ href: null }} />
      <Tabs.Screen name="cluster/[clusterId]/waiting" options={{ href: null }} />
      {/* Room keeps the tab bar but disables its hide-on-keyboard animation:
          the KAV pads the container by the keyboard height, so the tab bar
          staying put (under the keyboard) keeps one static layout actor. */}
      <Tabs.Screen name="cluster/[clusterId]/room" options={{ href: null, animation: 'fade', tabBarHideOnKeyboard: false }} />
      <Tabs.Screen
        name="cluster/[clusterId]/call"
        options={{ href: null, animation: 'fade', tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen name="cluster/[clusterId]/members" options={{ href: null, animation: 'fade' }} />
      <Tabs.Screen name="cluster/[clusterId]/signals" options={{ href: null, animation: 'fade' }} />
      <Tabs.Screen name="cluster/[clusterId]/signals/[signalId]" options={{ href: null }} />
      <Tabs.Screen name="cluster/[clusterId]/votes" options={{ href: null, animation: 'fade' }} />
      <Tabs.Screen name="cluster/[clusterId]/settings" options={{ href: null, animation: 'fade' }} />
      <Tabs.Screen name="profile/[userId]" options={{ href: null }} />
      {/* No tab bar on post detail (Instagram pattern): the sticky comment
          composer must sit directly above the keyboard. With a tab bar between
          the list and the screen bottom, the keyboard-glued footer would float
          exactly tab-bar-height too high on edge-to-edge Android, leaving a
          strip of thread content visible underneath it. */}
      <Tabs.Screen name="posts/[postId]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="settings/reports" options={{ href: null }} />
    </Tabs>
  )
}
