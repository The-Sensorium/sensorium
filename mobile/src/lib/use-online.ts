import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import * as Network from 'expo-network'

const OFFLINE_DELAY_MS = 3000

export function useOnline(delayMs = OFFLINE_DELAY_MS) {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    let mounted = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const readState = (state: Network.NetworkState) =>
      state.isInternetReachable ?? state.isConnected ?? true
    const applyState = (state: Network.NetworkState) => {
      if (!mounted) return
      if (readState(state)) {
        if (timer) clearTimeout(timer)
        timer = undefined
        setOnline(true)
      } else if (!timer) {
        timer = setTimeout(() => {
          if (mounted) setOnline(false)
        }, delayMs)
      }
    }
    void Network.getNetworkStateAsync()
      .then(applyState)
      .catch(() => undefined)
    const subscription = Network.addNetworkStateListener(applyState)
    const appSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void Network.getNetworkStateAsync().then(applyState).catch(() => undefined)
      }
    })
    return () => {
      mounted = false
      if (timer) clearTimeout(timer)
      subscription.remove()
      appSubscription.remove()
    }
  }, [delayMs])

  return online
}
