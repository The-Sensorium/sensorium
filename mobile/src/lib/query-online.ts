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
  const refresh = (force = false) =>
    Network.getNetworkStateAsync()
      .then((state) => {
        if (force || !initialised) onlineManager.setOnline(toOnline(state))
      })
      .catch(() => undefined)
  void refresh()
  // Phone sleep/wake often fires no network event on foreground, which would
  // leave onlineManager stuck offline and pause every query and mutation.
  const appSubscription = AppState.addEventListener('change', (status) => {
    if (status === 'active') void refresh(true)
  })
  return () => {
    subscription.remove()
    appSubscription.remove()
  }
}

export function setupQueryFocusManager() {
  const subscription = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active')
  })
  return () => subscription.remove()
}
