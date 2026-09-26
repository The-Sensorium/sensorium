import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppState, Platform } from 'react-native'
import * as Network from 'expo-network'
import { focusManager, onlineManager } from '@tanstack/react-query'
import { setupQueryFocusManager, setupQueryOnlineManager } from './query-online'

vi.mock('expo-network', () => ({
  addNetworkStateListener: vi.fn(),
  getNetworkStateAsync: vi.fn(),
}))

vi.mock('react-native', () => ({
  AppState: { addEventListener: vi.fn() },
  Platform: { OS: 'ios' },
}))

const addListenerMock = vi.mocked(Network.addNetworkStateListener)
const getStateMock = vi.mocked(Network.getNetworkStateAsync)
const appStateMock = vi.mocked(AppState.addEventListener)

describe('setupQueryOnlineManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStateMock.mockResolvedValue({ isConnected: true, isInternetReachable: true } as never)
    addListenerMock.mockReturnValue({ remove: vi.fn() } as never)
  })

  it('marks online when connected and reachable', async () => {
    const setOnline = vi.spyOn(onlineManager, 'setOnline').mockImplementation(() => undefined)
    let listener: ((s: Network.NetworkState) => void) | undefined
    addListenerMock.mockImplementation((cb) => {
      listener = cb as (s: Network.NetworkState) => void
      return { remove: vi.fn() } as never
    })
    const teardown = setupQueryOnlineManager()
    listener?.({ isConnected: true, isInternetReachable: true } as Network.NetworkState)
    expect(setOnline).toHaveBeenCalledWith(true)
    listener?.({ isConnected: true, isInternetReachable: false } as Network.NetworkState)
    expect(setOnline).toHaveBeenCalledWith(false)
    listener?.({ isConnected: false } as Network.NetworkState)
    expect(setOnline).toHaveBeenCalledWith(false)
    teardown()
    setOnline.mockRestore()
  })

  it('falls back to initial fetch before first event', async () => {
    const setOnline = vi.spyOn(onlineManager, 'setOnline').mockImplementation(() => undefined)
    getStateMock.mockResolvedValue({ isConnected: false } as never)
    setupQueryOnlineManager()
    await vi.waitFor(() => expect(setOnline).toHaveBeenCalledWith(false))
    setOnline.mockRestore()
  })

  it('returns a teardown that removes the listener', () => {
    const remove = vi.fn()
    addListenerMock.mockReturnValue({ remove } as never)
    const teardown = setupQueryOnlineManager()
    teardown()
    expect(remove).toHaveBeenCalled()
  })
})

describe('setupQueryFocusManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks focused only when active', () => {
    const setFocused = vi.spyOn(focusManager, 'setFocused').mockImplementation(() => undefined)
    let handler: ((s: string) => void) | undefined
    appStateMock.mockImplementation(((_event: string, cb: (s: string) => void) => {
      handler = cb
      return { remove: vi.fn() } as never
    }) as never)
    const teardown = setupQueryFocusManager()
    handler?.('active')
    expect(setFocused).toHaveBeenCalledWith(true)
    handler?.('background')
    expect(setFocused).toHaveBeenCalledWith(false)
    teardown()
    setFocused.mockRestore()
  })

  it('skips focus updates on web', () => {
    const prev = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true })
    const setFocused = vi.spyOn(focusManager, 'setFocused').mockImplementation(() => undefined)
    let handler: ((s: string) => void) | undefined
    appStateMock.mockImplementation(((_event: string, cb: (s: string) => void) => {
      handler = cb
      return { remove: vi.fn() } as never
    }) as never)
    setupQueryFocusManager()
    handler?.('active')
    expect(setFocused).not.toHaveBeenCalled()
    Object.defineProperty(Platform, 'OS', { value: prev, configurable: true })
    setFocused.mockRestore()
  })
})
