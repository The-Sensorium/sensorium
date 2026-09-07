import { Pressable, Text, View } from 'react-native'
import { Link } from 'expo-router'
import { Archive, CalendarDays, CircleCheck, Hourglass, Users } from 'lucide-react-native'
import type { ClusterTile } from '../features/discovery'
import { modeInfo } from '../lib/modes'
import { radii, shadowSoft } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'

const formedFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const statusMeta = {
  active: { icon: CircleCheck, label: 'Active', color: '#047857' },
  introductions: { icon: Hourglass, label: 'Introductions in progress', color: '#b45309' },
  archived: { icon: Archive, label: 'Archived', color: null as string | null },
} as const

export function PublicClusterCard({
  cluster,
  isMember,
}: {
  cluster: ClusterTile
  isMember: boolean
}) {
  const t = useTheme()
  const status = statusMeta[cluster.status]
  const info = modeInfo(cluster.matching_mode)
  const Icon = info.icon
  const StatusIcon = status.icon
  const statusColor = status.color ?? t.onSurfaceVariant

  const body = (
    <View
      style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.xl, padding: 20, ...shadowSoft }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon size={14} color={t.primary} strokeWidth={1.5} />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                textTransform: 'uppercase',
                letterSpacing: 1,
                color: t.primary,
                flexShrink: 1,
              }}
              numberOfLines={1}
            >
              {info.label}
            </Text>
          </View>
          <Text
            style={{ marginTop: 4, fontSize: 18, fontWeight: '600', color: t.onSurface }}
            numberOfLines={1}
          >
            {cluster.name}
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: t.surfaceLowest,
            borderRadius: radii.pill,
            paddingHorizontal: 12,
            paddingVertical: 6,
            alignSelf: 'flex-start',
          }}
        >
          <Users size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
            {cluster.member_count} members
          </Text>
        </View>
      </View>
      <View style={{ marginTop: 12, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusIcon size={16} color={statusColor} strokeWidth={1.75} />
          <Text style={{ fontSize: 14, color: statusColor }}>{status.label}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <CalendarDays size={14} color={t.onSurfaceVariant} strokeWidth={1.5} />
          <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
            Formed {formedFormatter.format(new Date(cluster.created_at))}
          </Text>
        </View>
      </View>
    </View>
  )

  if (isMember) {
    return (
      <Link href={{ pathname: '/cluster/[clusterId]/room', params: { clusterId: cluster.id } }} asChild>
        <Pressable style={{ marginBottom: 16 }}>{body}</Pressable>
      </Link>
    )
  }
  return <View style={{ marginBottom: 16 }}>{body}</View>
}
