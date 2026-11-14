import { NativeModules, Platform } from 'react-native'

type LiveKitModule = {
  registerGlobals?: () => void
  default?: { registerGlobals?: () => void }
}

let registered = false
let available: boolean | null = null

/**
 * LiveKit's WebRTC bindings are a native module: they are compiled into a
 * development build or production app but absent in Expo Go (and unsupported on
 * web). The native module itself is the signal: `Constants.appOwnership` is
 * null on SDK 58 even inside Expo Go, so the old check failed open and
 * `@livekit/react-native-webrtc` threw at import. Probing the module also
 * covers a build whose WebRTC plugin is missing, and lets the call screen
 * degrade to a message instead of crashing on import.
 */
export function isLiveKitAvailable(): boolean {
  if (available === null) {
    available = Platform.OS !== 'web' && NativeModules.WebRTCModule != null
  }
  return available
}

/**
 * Register LiveKit's WebRTC globals exactly once per app lifetime. Called from
 * AppProviders on startup; the flag makes it a no-op across StrictMode double
 * effects and Fast Refresh re-executions. The module is imported lazily so Expo
 * Go never evaluates the native binding.
 */
export function ensureLiveKitGlobals(): void {
  if (registered || !isLiveKitAvailable()) return
  registered = true
  import('@livekit/react-native')
    .then((mod) => {
      const scoped = mod as LiveKitModule
      const register = scoped.registerGlobals ?? scoped.default?.registerGlobals
      if (typeof register !== 'function') {
        registered = false
        available = false
        return
      }
      register()
    })
    .catch(() => {
      registered = false
      available = false
    })
}
