import { useEffect, useState } from 'react'
import * as Network from 'expo-network'

export function useOnline() {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true
    const readState = (state: Network.NetworkState) =>
      state.isInternetReachable ?? state.isConnected ?? true
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (mounted) setOnline(readState(state))
      })
      .catch(() => undefined)
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(readState(state))
    })
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])

  return online ?? true
}
