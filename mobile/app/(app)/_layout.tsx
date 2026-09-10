import { useEffect } from 'react'
import { router, Tabs } from 'expo-router'
import { Bell, Home, Newspaper, Settings, Users } from 'lucide-react-native'
import { useAuth } from '../../src/auth-context'
import { useNotificationsChannel, useUnreadCount } from '../../src/features/notifications'
import { useActiveAccountGate } from '../../src/lib/use-active-account'
import { useTheme } from '../../src/lib/use-theme'
import { onPushResponse, getLaunchPushData, syncBadgeCount } from '../../src/lib/push'
import { pushDataToHref, type PushData } from '../../src/lib/notification-routing'

export default function AppTabs() {
  const t = useTheme()
  const auth = useAuth()
  const userId = auth.state === 'signedIn' ? auth.userId : null
  useActiveAccountGate('member')
  useNotificationsChannel(userId)
  const unread = useUnreadCount()
  const badge = (unread.data ?? 0) > 0 ? String(unread.data) : undefined
  useEffect(() => {
    void syncBadgeCount(unread.data ?? 0)
  }, [unread.data])
  useEffect(() => {
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void onPushResponse((data) => {
      const target = pushDataToHref(data as PushData)
      if (target) router.push(target)
    }).then((fn) => {
      if (disposed) fn()
      else unsubscribe = fn
    })
    // A tap that cold-starts a terminated app is not delivered through the
    // listener above; it must be read once at startup.
    void getLaunchPushData().then((data) => {
      if (!disposed && data) {
        const target = pushDataToHref(data as PushData)
        if (target) router.push(target)
      }
    })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.onSurfaceVariant,
        tabBarStyle: { backgroundColor: t.surface },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
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
      <Tabs.Screen name="cluster/[clusterId]/room" options={{ href: null, animation: 'fade' }} />
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
      <Tabs.Screen name="posts/[postId]" options={{ href: null }} />
      <Tabs.Screen name="settings/reports" options={{ href: null }} />
    </Tabs>
  )
}
