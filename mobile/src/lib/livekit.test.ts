import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  os: 'android',
  modules: {} as Record<string, unknown>,
}))

const registerGlobals = vi.hoisted(() => vi.fn())

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return state.os
    },
  },
  NativeModules: state.modules,
}))

vi.mock('@livekit/react-native', () => ({
  registerGlobals,
  default: { registerGlobals },
}))

async function loadModule() {
  return import('./livekit')
}

describe('isLiveKitAvailable', () => {
  beforeEach(() => {
    vi.resetModules()
    registerGlobals.mockClear()
    state.os = 'android'
    for (const key of Object.keys(state.modules)) delete state.modules[key]
  })

  it('is unavailable when the WebRTC native module is absent (Expo Go)', async () => {
    const { isLiveKitAvailable } = await loadModule()
    expect(isLiveKitAvailable()).toBe(false)
  })

  it('is available when the WebRTC native module is installed', async () => {
    state.modules.WebRTCModule = {}
    const { isLiveKitAvailable } = await loadModule()
    expect(isLiveKitAvailable()).toBe(true)
  })

  it('is unavailable on web even when the module is installed', async () => {
    state.modules.WebRTCModule = {}
    state.os = 'web'
    const { isLiveKitAvailable } = await loadModule()
    expect(isLiveKitAvailable()).toBe(false)
  })
})

describe('ensureLiveKitGlobals', () => {
  beforeEach(() => {
    vi.resetModules()
    registerGlobals.mockClear()
    state.os = 'android'
    for (const key of Object.keys(state.modules)) delete state.modules[key]
  })

  it('never imports LiveKit without the native module', async () => {
    const { ensureLiveKitGlobals } = await loadModule()
    ensureLiveKitGlobals()
    await Promise.resolve()
    expect(registerGlobals).not.toHaveBeenCalled()
  })

  it('registers globals once when the native module is installed', async () => {
    state.modules.WebRTCModule = {}
    const { ensureLiveKitGlobals } = await loadModule()
    ensureLiveKitGlobals()
    ensureLiveKitGlobals()
    await vi.waitFor(() => expect(registerGlobals).toHaveBeenCalledOnce())
  })
})
