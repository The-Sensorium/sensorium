import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { router, type Href } from 'expo-router'
import { Menu, MessageCircle, MessageSquare, Scale, Settings, Users } from 'lucide-react-native'
import { radii, shadowShape } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

export type ClusterSection = 'room' | 'members' | 'signals' | 'votes' | 'settings'

const SECTIONS: { key: ClusterSection; label: string; icon: typeof MessageSquare; href: (clusterId: string) => Href }[] = [
  { key: 'room', label: 'Room', icon: MessageSquare, href: (id) => ({ pathname: '/cluster/[clusterId]/room', params: { clusterId: id } }) },
  { key: 'members', label: 'Members', icon: Users, href: (id) => ({ pathname: '/cluster/[clusterId]/members', params: { clusterId: id } }) },
  { key: 'signals', label: 'Signals', icon: MessageCircle, href: (id) => ({ pathname: '/cluster/[clusterId]/signals', params: { clusterId: id } }) },
  { key: 'votes', label: 'Votes', icon: Scale, href: (id) => ({ pathname: '/cluster/[clusterId]/votes', params: { clusterId: id } }) },
  { key: 'settings', label: 'Settings', icon: Settings, href: (id) => ({ pathname: '/cluster/[clusterId]/settings', params: { clusterId: id } }) },
]

export function ClusterSectionHeader({
  title,
  clusterId,
  section,
}: {
  title: string
  clusterId: string
  section: ClusterSection
}) {
  const t = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontSize: 20, lineHeight: 28, fontWeight: '600', color: t.onSurface }}>{title}</Text>
      <ClusterMenu clusterId={clusterId} active={section} />
    </View>
  )
}

export function ClusterMenu({ clusterId, active }: { clusterId: string; active: ClusterSection }) {
  const t = useTheme()
  const [open, setOpen] = useState(false)

  return (
    // In-screen popover anchored to the trigger (not a native Modal): a modal
    // is a separate native overlay, so its fade-out keeps playing over the
    // destination screen after a section tap. An in-screen popover is part of
    // the screen and unmounts with it, so navigation shows no lingering menu.
    <View>
      <Pressable
        accessibilityLabel="Cluster sections"
        accessibilityRole="button"
        onPress={() => setOpen((o) => !o)}
        hitSlop={8}
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}
      >
        <Menu size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
      </Pressable>
      {open ? (
        <View
          style={{
            position: 'absolute',
            top: 56,
            right: 0,
            width: 208,
            backgroundColor: t.surfaceLowest,
            borderRadius: radii.xl,
            padding: 8,
            gap: 2,
            zIndex: 10,
            ...shadowShape,
            shadowColor: t.shadowColor,
          }}
        >
          {SECTIONS.map((s) => {
            const isActive = s.key === active
            const Icon = s.icon
            // Plain Pressable, not Link asChild: expo-router's Slot flattens
            // child style arrays and silently drops function styles, which
            // would strip this row's layout. Navigate via router instead.
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  setOpen(false)
                  router.push(s.href(clusterId))
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: radii.md,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  minHeight: 48,
                  backgroundColor: isActive || pressed ? t.surfaceContainer : 'transparent',
                })}
              >
                <Icon size={16} color={isActive ? t.primary : t.onSurface} strokeWidth={1.5} />
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? t.primary : t.onSurface,
                  }}
                >
                  {s.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      ) : null}
    </View>
  )
}
