import { useEffect } from 'react'
import { router, Tabs } from 'expo-router'
import { Bell, Home, Newspaper, Settings, Users } from 'lucide-react-native'
import { useAuth } from '../../src/auth-context'
import { goLogin } from '../../src/lib/auth-navigation'
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
  useEffect(() => {
    if (auth.state === 'signedOut') goLogin()
  }, [auth.state])
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
      // Expo Tabs does not expose unmountOnBlur, so freshness across ids is
      // handled in the screens: composers are keyed by cluster/post/signal
      // id, transient room and signal state resets on param change, sticky
      // footer height resets per post, and keyboard is dismissed on blur.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.onSurfaceVariant,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.outlineVariant },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '500' },
        tabBarBadgeStyle: { backgroundColor: t.error, color: t.onError, fontSize: 11, fontWeight: '600', minWidth: 18, height: 18, borderRadius: 9, lineHeight: 16, textAlign: 'center' },
        // Sticky composers own keyboard positioning natively. Hiding the tab
        // bar on every keyboard open would add a second moving boundary and
        // fight the composer translate, so only chat screens hide the bar
        // permanently via display: none below.
        tabBarHideOnKeyboard: false,
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
      <Tabs.Screen name="cluster/[clusterId]/introductions" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cluster/[clusterId]/waiting" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      {/* No tab bar anywhere inside a cluster (room, members, signals,
          votes, settings, call), same as post detail: a focused space with
          its own back navigation and keyboard-glued composers. A tab bar
          between the content and the screen bottom would fight the composer
          translate and leave a floating strip on edge-to-edge Android.
          No custom animation: the default tab switch avoids a
          semi-transparent crossfade that flashes bordered cards. */}
      <Tabs.Screen name="cluster/[clusterId]/room" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen
        name="cluster/[clusterId]/call"
        options={{ href: null, animation: 'fade', tabBarStyle: { display: 'none' } }}
      />
      <Tabs.Screen name="cluster/[clusterId]/members" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cluster/[clusterId]/signals" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cluster/[clusterId]/signals/[signalId]" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cluster/[clusterId]/votes" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      <Tabs.Screen name="cluster/[clusterId]/settings" options={{ href: null, tabBarStyle: { display: 'none' } }} />
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
