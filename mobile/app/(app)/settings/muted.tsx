import { Pressable, Text, View } from 'react-native'
import { ArrowLeft } from 'lucide-react-native'
import { useMyMutes } from '../../../src/features/moderation'
import { useClusterBack } from '../../../src/lib/use-cluster-back'
import { radii } from '../../../src/lib/theme-tokens'
import { useTheme } from '../../../src/lib/use-theme'
import { Avatar } from '../../../src/components/Avatar'
import { MuteButton } from '../../../src/components/MuteButton'
import { Card, LoadingView, Screen } from '../../../src/components/ui'

export default function MutedMembersScreen() {
  const t = useTheme()
  const mutes = useMyMutes()
  const goBack = useClusterBack('/settings')
  const muted = mutes.data ?? []

  return (
    <Screen>
      <Pressable
        onPress={goBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 12, minHeight: 48, paddingRight: 16, marginBottom: 12 }}
      >
        <ArrowLeft size={18} color={t.primary} strokeWidth={2} />
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.primary }}>
          Back
        </Text>
      </Pressable>

      <Text style={{ fontSize: 24, lineHeight: 30, letterSpacing: -0.2, fontWeight: '600', color: t.onSurface }} accessibilityRole="header">
        Muted members
      </Text>
      <Text style={{ marginTop: 4, marginBottom: 16, fontSize: 14, lineHeight: 20, color: t.onSurfaceVariant }}>
        Muted members are hidden for you only. They are never told.
      </Text>

      {mutes.isLoading ? (
        <LoadingView />
      ) : mutes.isError ? (
        <Card>
          <Text accessibilityRole="alert" style={{ fontSize: 14, lineHeight: 20, color: t.error }}>
            Couldn’t load your muted members. Please try again.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Try loading muted members again"
            hitSlop={8}
            onPress={() => void mutes.refetch()}
            style={{ marginTop: 4, paddingVertical: 8, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: t.primary }}>
              Try again
            </Text>
          </Pressable>
        </Card>
      ) : muted.length === 0 ? (
        <Card plain>
          <Text style={{ fontSize: 14, lineHeight: 20, textAlign: 'center', color: t.onSurfaceVariant }}>
            You haven’t muted anyone.
          </Text>
        </Card>
      ) : (
        <View style={{ gap: 8 }}>
          {muted.map((m) => (
            <View
              key={m.muted_user_id}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderWidth: 1, borderColor: t.outlineVariant, borderRadius: radii.md, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Avatar name={m.display_name ?? 'Member'} src={m.avatar_url} thumbSrc={m.avatar_thumb_url ?? m.avatar_url} size={32} />
                <Text style={{ fontSize: 14, color: t.onSurface }} numberOfLines={1}>
                  {m.display_name ?? 'Member'}
                </Text>
              </View>
              <MuteButton targetUserId={m.muted_user_id} targetName={m.display_name ?? 'Member'} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  )
}
