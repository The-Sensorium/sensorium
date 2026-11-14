import { useMemo } from 'react'
import { Tabs } from 'expo-router'
import { Bell, Home, Newspaper, Settings, Users } from 'lucide-react-native'
import { useUnreadCount } from '../../../src/features/notifications'
import { useMyClusters } from '../../../src/features/matching'
import { useNewPostsCounts } from '../../../src/features/posts-badge'
import { useTheme } from '../../../src/lib/use-theme'
import { badgeLabel } from '../../../src/lib/tab-badge'

// Deep links and push cold starts seed this group, so Home is the base tab a
// pushed detail returns to instead of whichever route sorts first.
export const unstable_settings = { anchor: 'home' }

export default function AppTabs() {
  const t = useTheme()
  const unread = useUnreadCount()
  const badge = badgeLabel(unread.data ?? 0)
  const clusters = useMyClusters()
  const clusterIds = useMemo(
    () => (clusters.data ?? []).map((c) => c.cluster.id),
    [clusters.data],
  )
  const newPosts = useNewPostsCounts(clusterIds)
  const newPostsTotal = useMemo(
    () => [...(newPosts.data?.values() ?? [])].reduce((sum, count) => sum + count, 0),
    [newPosts.data],
  )
  const postsBadge = badgeLabel(newPostsTotal)
  return (
    <Tabs
      // Back walks the tab visit trail. Detail screens are stack pushes now,
      // so they are handled by the parent native stack.
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
        // fight the composer translate. Chat screens are stack pushes now, so
        // they have no tab bar to hide.
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
          tabBarBadge: postsBadge,
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
    </Tabs>
  )
}
