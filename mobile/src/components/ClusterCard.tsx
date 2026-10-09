import { Pressable, Text, View } from 'react-native'
import { Link, type Href } from 'expo-router'
import { MessagesSquare, Users } from 'lucide-react-native'
import type { MyCluster } from '../features/matching'
import { isCreatedCluster, isPendingCreated } from '../features/created-clusters'
import { useMyMembership } from '../features/introductions'
import { modeInfo } from '../lib/modes'
import { radii, shadowShape } from '../lib/theme-tokens'
import { useTheme } from '../lib/use-theme'
import { useClusterTheme } from '../lib/use-cluster-appearance'

function statusLabel(status: string): string {
  if (status === 'archived') return 'Archived'
  return 'Active'
}

export function ClusterCard({
  item,
  myIntroCompletedAt,
  unreadCount,
}: {
  item: MyCluster
  myIntroCompletedAt?: string | null
  unreadCount?: number
}) {
  const t = useTheme()
  const { cluster } = item
  const clusterTheme = useClusterTheme(cluster.id)
  const accent = clusterTheme.tokens.accent
  const accentText = clusterTheme.tokens.accentText
  const cardBg = clusterTheme.appearanceId === 'default' ? t.surfaceContainer : clusterTheme.tokens.surface
  const info = modeInfo(cluster.matching_mode)
  const Icon = info.icon
  const needsIntros = myIntroCompletedAt === null
  const count = unreadCount ?? 0
  const created = isCreatedCluster(cluster)
  const pending = isPendingCreated(cluster, item.memberCount)
  const target: Href = { pathname: '/cluster/[clusterId]/room', params: { clusterId: cluster.id } }

  return (
    <Link href={target} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${cluster.name}`}
        style={{
          backgroundColor: cardBg,
          borderRadius: radii.xl,
          padding: 16,
          marginBottom: 16,
          ...shadowShape,
          shadowColor: t.shadowColor,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {created ? (
                <Users size={20} color={accent} strokeWidth={1.5} />
              ) : (
                <Icon size={20} color={accent} strokeWidth={1.5} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 16,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: accentText,
                  flexShrink: 1,
                }}
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
              >
                {created ? 'Created cluster' : info.label}
              </Text>
            </View>
            <Text
              style={{ marginTop: 4, fontSize: 18, lineHeight: 24, fontWeight: '600', color: t.onSurface }}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
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
            <Users size={20} color={t.onSurfaceVariant} strokeWidth={1.5} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.onSurfaceVariant }}>
              {item.memberCount} members
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 14, color: t.onSurfaceVariant }}>
            {pending ? (
              <Text>
                Pending · {3 - item.memberCount} more to activate
              </Text>
            ) : needsIntros ? (
              <Text>Complete your introductions</Text>
            ) : (
              statusLabel(cluster.status)
            )}
          </Text>
          {count > 0 && (
            <View
              testID={`cluster-unread-badge-${cluster.id}`}
              accessibilityLabel={`${count} unread messages`}
              accessibilityRole="text"
              style={{
                position: 'relative',
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: t.surfaceLowest,
                borderRadius: radii.pill,
                paddingHorizontal: 12,
                paddingVertical: 6,
                flexShrink: 0,
              }}
            >
              <MessagesSquare size={16} color={t.primary} strokeWidth={1.5} />
              <View
                style={{
                  position: 'absolute',
                  right: -4,
                  top: -4,
                  minWidth: 20,
                  minHeight: 20,
                  borderRadius: 10,
                  backgroundColor: t.error,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
              >
                <Text
                  style={{ fontSize: 11, lineHeight: 16, fontWeight: '600', color: t.onError }}
                  maxFontSizeMultiplier={1.4}
                >
                  {count > 9 ? '9+' : count}
                </Text>
              </View>
            </View>
          )}
        </View>
      </Pressable>
    </Link>
  )
}

/** ClusterCard with the caller's intro state: personalizes the pending copy. */
export function MemberClusterCard({ item, unreadCount }: { item: MyCluster; unreadCount?: number }) {
  const membership = useMyMembership(item.cluster.id)
  return (
    <ClusterCard
      item={item}
      myIntroCompletedAt={membership.data ? membership.data.intro_completed_at : undefined}
      unreadCount={unreadCount}
    />
  )
}
