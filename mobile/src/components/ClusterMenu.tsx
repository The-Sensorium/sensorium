import { useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import { Menu, MessageCircle, MessageSquare, Scale, Settings, Users } from 'lucide-react-native'
import { radii } from '../lib/theme-tokens'
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
      <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>{title}</Text>
      <ClusterMenu clusterId={clusterId} active={section} />
    </View>
  )
}

export function ClusterMenu({ clusterId, active }: { clusterId: string; active: ClusterSection }) {
  const t = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Pressable
        accessibilityLabel="Cluster sections"
        onPress={() => setOpen(true)}
        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
      >
        <Menu size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1 }}>
          <View
            style={{
              position: 'absolute',
              top: 64,
              right: 16,
              width: 208,
              backgroundColor: t.surfaceLowest,
              borderRadius: radii.xl,
              padding: 4,
              gap: 2,
            }}
          >
            {SECTIONS.map((s) => {
              const isActive = s.key === active
              const Icon = s.icon
              return (
                <Link key={s.key} href={s.href(clusterId)} asChild>
                  <Pressable
                    onPress={() => setOpen(false)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      borderRadius: radii.md,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: isActive ? t.surfaceContainer : 'transparent',
                    }}
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
                </Link>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
