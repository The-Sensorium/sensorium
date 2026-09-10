import { registerGlobals } from '@livekit/react-native'

let registered = false

/**
 * Register LiveKit's WebRTC globals exactly once per app lifetime. Called from
 * AppProviders on startup; the flag makes it a no-op across StrictMode double
 * effects and Fast Refresh re-executions.
 */
export function ensureLiveKitGlobals(): void {
  if (registered) return
  registered = true
  registerGlobals()
}
