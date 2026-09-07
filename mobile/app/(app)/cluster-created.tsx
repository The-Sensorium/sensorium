import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Link, router } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { Cake, MapPin, PartyPopper } from 'lucide-react-native'
import { requireSupabase } from '../../src/lib/supabase'
import { countryName } from '../../src/lib/countries'
import {
  useLatestClusterFormed,
  useClusterMembers,
  type ClusterFormedNotification,
} from '../../src/features/matching'
import { radii } from '../../src/lib/theme-tokens'
import { useTheme } from '../../src/lib/use-theme'
import { Card, LoadingView, PrimaryButton, Screen } from '../../src/components/ui'

export default function ClusterCreatedScreen() {
  const t = useTheme()
  const queryClient = useQueryClient()
  const formed = useLatestClusterFormed()
  const [notif, setNotif] = useState<ClusterFormedNotification | null>(null)

  useEffect(() => {
    if (formed.data && !notif) {
      setNotif(formed.data)
      const supabase = requireSupabase()
      void supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', formed.data.id)
        .then(({ error }) => {
          if (!error && formed.data) {
            void queryClient.invalidateQueries({ queryKey: ['cluster-formed'] })
          }
        })
    }
  }, [formed.data, notif, queryClient])

  const clusterId = notif?.cluster_id ?? null
  const members = useClusterMembers(clusterId, clusterId !== null)

  if (!notif && formed.isLoading) {
    return (
      <Screen>
        <LoadingView />
      </Screen>
    )
  }

  if (!clusterId) {
    return (
      <Screen>
        <Card plain>
          <View style={{ alignItems: 'center', padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface }}>
              No new cluster
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, textAlign: 'center', color: t.onSurfaceVariant }}>
              There isn’t a cluster ready to introduce yet. Keep waiting in a queue and you’ll be
              matched soon.
            </Text>
            <View style={{ marginTop: 20, width: '100%' }}>
              <Link href="/(app)/home" asChild>
                <PrimaryButton title="Back to home" onPress={() => {}} />
              </Link>
            </View>
          </View>
        </Card>
      </Screen>
    )
  }

  return (
    <Screen>
      <View style={{ backgroundColor: t.surfaceContainer, borderRadius: radii.xl, padding: 32, alignItems: 'center' }}>
        <View
          style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center' }}
        >
          <PartyPopper size={32} color={t.onPrimary} strokeWidth={1.5} />
        </View>
        <Text style={{ marginTop: 20, fontSize: 28, fontWeight: '600', color: t.onSurface }}>
          Your cluster is ready
        </Text>
        <Text style={{ marginTop: 8, fontSize: 14, lineHeight: 22, textAlign: 'center', color: t.onSurfaceVariant }}>
          Eight strangers matched. Complete your introductions within 72 hours to unlock the chat.
        </Text>
      </View>

      <Text style={{ fontSize: 20, fontWeight: '600', color: t.onSurface, marginTop: 24, marginBottom: 12 }}>
        Your new cluster
      </Text>
      {members.isLoading ? (
        <LoadingView label="Loading members…" />
      ) : (
        <View style={{ backgroundColor: t.surfaceLowest, borderRadius: radii.xl, overflow: 'hidden' }}>
          {(members.data ?? []).map((member) => (
            <View
              key={member.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14 }}
            >
              <View
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceContainer, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: t.primary }}>
                  {member.display_name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: t.onSurface }} numberOfLines={1}>
                  {member.display_name}
                </Text>
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                  {member.country_code ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12} color={t.onSurfaceVariant} strokeWidth={1.5} />
                      <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                        {countryName(member.country_code)}
                      </Text>
                    </View>
                  ) : null}
                  {member.birth_year ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Cake size={12} color={t.onSurfaceVariant} strokeWidth={1.5} />
                      <Text style={{ fontSize: 12, color: t.onSurfaceVariant }}>
                        {member.birth_year}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: 24 }}>
        <PrimaryButton
          title="Start introductions"
          onPress={() =>
            router.replace({
              pathname: '/cluster/[clusterId]/introductions',
              params: { clusterId },
            })
          }
        />
      </View>
    </Screen>
  )
}
