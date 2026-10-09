import { useEffect } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useCluster } from '../../../../src/features/introductions'
import { Screen, LoadingView } from '../../../../src/components/ui'
import { ClusterThemeProvider } from '../../../../src/lib/cluster-theme'

/**
 * Compatibility route only: clusters open at formation, so there is no
 * waiting state. Anyone landing here (old links) goes to the room.
 */
export default function WaitingScreen() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  return (
    <ClusterThemeProvider clusterId={clusterId || null}>
      <WaitingScreenContent />
    </ClusterThemeProvider>
  )
}

function WaitingScreenContent() {
  const { clusterId = '' } = useLocalSearchParams<{ clusterId: string }>()
  const cluster = useCluster(clusterId || null)

  useEffect(() => {
    if (cluster.data) {
      router.replace({ pathname: '/cluster/[clusterId]/room', params: { clusterId } })
    }
  }, [cluster.data, clusterId])

  return (
    <Screen>
      <LoadingView />
    </Screen>
  )
}
