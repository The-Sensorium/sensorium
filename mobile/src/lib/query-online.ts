import { AppState, Platform } from 'react-native'
import * as Network from 'expo-network'
import { focusManager, onlineManager } from '@tanstack/react-query'

function toOnline(state: Network.NetworkState): boolean {
  return !!state.isConnected && (state.isInternetReachable ?? true)
}

export function setupQueryOnlineManager() {
  let initialised = false
  const subscription = Network.addNetworkStateListener((state) => {
    initialised = true
    onlineManager.setOnline(toOnline(state))
  })
  void Network.getNetworkStateAsync()
    .then((state) => {
      if (!initialised) onlineManager.setOnline(toOnline(state))
    })
    .catch(() => undefined)
  return () => subscription.remove()
}

export function setupQueryFocusManager() {
  const subscription = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active')
  })
  return () => subscription.remove()
}
