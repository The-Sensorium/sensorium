/**
 * Call audio output routing.
 *
 * Mobile calls defaulted to the phone earpiece with no way to switch, which
 * made group conversation nearly inaudible. This module centralizes the
 * speakerphone default (bluetooth/headset still win when connected) and the
 * speaker toggle, behind the AudioSession API bundled with
 * `@livekit/react-native`.
 *
 * The native audio device module requires LiveKitReactNative.setup() in
 * Application.onCreate, wired through the LiveKit Expo config plugin in
 * app.json. Every AudioSession call below assumes that setup is present in
 * the installed build.
 *
 * The pure helpers take an explicit platform string so they stay testable in
 * the node vitest env without importing react-native. The live wrappers
 * dynamic-import the native module so Expo Go (where it is absent) never
 * evaluates it; they are only reached from the lazily loaded call surface.
 */

export type CallAudioPlatform = 'ios' | 'android' | (string & {})

interface AudioSessionLike {
  configureAudio?: (config: unknown) => Promise<void>
  startAudioSession?: () => Promise<void>
  stopAudioSession?: () => Promise<void>
  getAudioOutputs?: () => Promise<string[]>
  selectAudioOutput?: (deviceId: string) => Promise<void>
}

/** Output id that routes to the loudspeaker on each platform. */
export function speakerOutputFor(platform: CallAudioPlatform): string {
  return platform === 'ios' ? 'force_speaker' : 'speaker'
}

/** Output id that routes back to the earpiece / OS default. */
export function earpieceOutputFor(platform: CallAudioPlatform): string {
  return platform === 'ios' ? 'default' : 'earpiece'
}

/**
 * AudioSession configuration applied before connecting: speaker-first
 * auto-routing on Android (bluetooth and wired headsets still take
 * precedence when connected) and speaker default on iOS.
 *
 * The Android audioTypeOptions mirror AndroidAudioTypePresets.communication
 * verbatim; they are kept literal so this module stays importable without
 * evaluating the native binding (node tests, Expo Go).
 */
export function callAudioConfig(): {
  android: {
    preferredOutputList: Array<'bluetooth' | 'headset' | 'speaker' | 'earpiece'>
    audioTypeOptions: {
      manageAudioFocus: boolean
      audioMode: 'inCommunication'
      audioFocusMode: 'gain'
      audioStreamType: 'voiceCall'
      audioAttributesUsageType: 'voiceCommunication'
      audioAttributesContentType: 'speech'
    }
  }
  ios: { defaultOutput: 'speaker' }
} {
  return {
    android: {
      preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
      audioTypeOptions: {
        manageAudioFocus: true,
        audioMode: 'inCommunication',
        audioFocusMode: 'gain',
        audioStreamType: 'voiceCall',
        audioAttributesUsageType: 'voiceCommunication',
        audioAttributesContentType: 'speech',
      },
    },
    ios: { defaultOutput: 'speaker' },
  }
}

/** True when a bluetooth or wired headset is among the available outputs. */
export function hasExternalOutput(outputs: string[]): boolean {
  return outputs.includes('bluetooth') || outputs.includes('headset')
}

/**
 * Configure the audio session for a call and start it. The speaker-first
 * routing comes from `callAudioConfig().android.preferredOutputList`
 * (bluetooth/headset first, then speaker, then earpiece) and the iOS speaker
 * default, which keep applying when devices connect or disconnect mid-call.
 * Setup deliberately never pins an output with `selectAudioOutput`: per the
 * SDK docs a manual selection disables the preferred list, which would trap
 * audio on the loudspeaker when a headset connects mid-call. Explicit
 * selection is reserved for the user's own toggle. Every step is
 * best-effort: audio must never block joining a call.
 */
export async function setupCallAudio(audioSession: AudioSessionLike): Promise<void> {
  try {
    await audioSession.configureAudio?.(callAudioConfig())
  } catch {
    // Fall through to starting the session with whatever config stuck.
  }
  try {
    await audioSession.startAudioSession?.()
  } catch {
    // Stay silent rather than failing the join.
  }
}

export async function teardownCallAudio(audioSession: AudioSessionLike): Promise<void> {
  try {
    await audioSession.stopAudioSession?.()
  } catch {
    // Leaving a call must never throw.
  }
}

/**
 * Explicit speaker-vs-earpiece toggle. On iOS selecting `default` alone would
 * still resolve to the configured speaker default, so the toggle also
 * re-configures `ios.defaultOutput` (speaker/earpiece) before selecting.
 * This switches between the loudspeaker and the earpiece only; it does not
 * restore a previously connected bluetooth/headset route. Users on an
 * external device can re-select it through the OS output picker.
 *
 * Rejects when the native call fails; the live wrapper below converts that
 * to a boolean, so direct callers must handle rejection themselves.
 */
export async function setSpeakerEnabled(
  enabled: boolean,
  platform: CallAudioPlatform,
  audioSession: AudioSessionLike,
): Promise<void> {
  if (platform === 'ios' && audioSession.configureAudio) {
    await audioSession.configureAudio({ ios: { defaultOutput: enabled ? 'speaker' : 'earpiece' } })
  }
  const output = enabled ? speakerOutputFor(platform) : earpieceOutputFor(platform)
  await audioSession.selectAudioOutput?.(output)
}

async function loadAudioSession(): Promise<AudioSessionLike | null> {
  try {
    const mod = (await import('@livekit/react-native')) as unknown as {
      AudioSession?: { default?: AudioSessionLike } & AudioSessionLike
    }
    return mod.AudioSession?.default ?? mod.AudioSession ?? null
  } catch {
    return null
  }
}

/** Live wrapper for the call screen: configure + start, default to speaker. */
export async function setupCallAudioSession(): Promise<void> {
  const audioSession = await loadAudioSession()
  if (!audioSession) return
  await setupCallAudio(audioSession)
}

/** Live wrapper for leaving the call screen. */
export async function teardownCallAudioSession(): Promise<void> {
  const audioSession = await loadAudioSession()
  if (!audioSession) return
  await teardownCallAudio(audioSession)
}

/** Live wrapper for the speaker toggle. Resolves true when the route applied. */
export async function setSpeakerEnabledLive(
  enabled: boolean,
  platform: CallAudioPlatform,
): Promise<boolean> {
  try {
    const audioSession = await loadAudioSession()
    if (!audioSession) return false
    const canSelect = typeof audioSession.selectAudioOutput === 'function'
    const canConfigureIos =
      platform === 'ios' && typeof audioSession.configureAudio === 'function'
    if (!canSelect && !canConfigureIos) return false
    await setSpeakerEnabled(enabled, platform, audioSession)
    return true
  } catch {
    // Toggling output must never crash a live call.
    return false
  }
}

/**
 * Live check for a connected bluetooth/headset. Resolves null when unknown
 * so callers can keep their default: the module is absent, the query failed,
 * or (on iOS) the SDK only exposes the `default` / `force_speaker` sentinel
 * list, which carries no device information.
 */
export async function hasExternalAudioOutputLive(
  platform: CallAudioPlatform,
): Promise<boolean | null> {
  if (platform === 'ios') return null
  try {
    const audioSession = await loadAudioSession()
    if (!audioSession?.getAudioOutputs) return null
    return hasExternalOutput(await audioSession.getAudioOutputs())
  } catch {
    return null
  }
}
