import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackHandler } from 'react-native'
import { router, type Href } from 'expo-router'
import { createClusterBackHandler, goBackWithFallback, subscribeClusterBack } from './use-cluster-back'

vi.mock('expo-router', () => ({
  router: {
    canGoBack: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
  },
  useFocusEffect: vi.fn(),
}))

vi.mock('react-native', () => ({
  BackHandler: {
    addEventListener: vi.fn(),
  },
}))

const mockRouter = vi.mocked(router)
const mockAddEventListener = vi.mocked(BackHandler.addEventListener)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('goBackWithFallback', () => {
  it('walks history when a previous screen exists', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const fallback = { pathname: '/cluster/[clusterId]/room', params: { clusterId: 'c1' } } as const
    goBackWithFallback(fallback)
    expect(mockRouter.back).toHaveBeenCalledOnce()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('replaces to the fallback parent with no history', () => {
    mockRouter.canGoBack.mockReturnValue(false)
    const fallback = { pathname: '/cluster/[clusterId]/room', params: { clusterId: 'c1' } } as const
    goBackWithFallback(fallback)
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith(fallback)
  })
})

describe('createClusterBackHandler', () => {
  it('consumes the press and walks history when possible', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const handler = createClusterBackHandler(() => '/(app)/home')
    expect(handler()).toBe(true)
    expect(mockRouter.back).toHaveBeenCalledOnce()
    expect(mockRouter.replace).not.toHaveBeenCalled()
  })

  it('reads the fallback lazily so clusterId changes are honored', () => {
    mockRouter.canGoBack.mockReturnValue(false)
    const getFallback = vi.fn(() => '/(app)/home' as const)
    const handler = createClusterBackHandler(getFallback)
    expect(handler()).toBe(true)
    expect(getFallback).toHaveBeenCalledOnce()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home')
  })
})

describe('subscribeClusterBack', () => {
  it('subscribes to hardwareBackPress and consumes the press', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const remove = vi.fn()
    mockAddEventListener.mockReturnValue({ remove } as unknown as ReturnType<typeof BackHandler.addEventListener>)
    subscribeClusterBack(() => '/(app)/home')
    expect(mockAddEventListener).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function))
    const handler = mockAddEventListener.mock.calls[0][1] as () => boolean
    expect(handler()).toBe(true)
    expect(mockRouter.back).toHaveBeenCalledOnce()
  })

  it('reads the latest fallback on each press and unsubscribes on cleanup', () => {
    mockRouter.canGoBack.mockReturnValue(false)
    const remove = vi.fn()
    mockAddEventListener.mockReturnValue({ remove } as unknown as ReturnType<typeof BackHandler.addEventListener>)
    let fallback: Href = '/(app)/home' as const
    const cleanup = subscribeClusterBack(() => fallback)
    const handler = mockAddEventListener.mock.calls[0][1] as () => boolean
    fallback = { pathname: '/cluster/[clusterId]/room', params: { clusterId: 'c2' } } as const
    expect(handler()).toBe(true)
    expect(mockRouter.replace).toHaveBeenCalledWith(fallback)
    cleanup()
    expect(remove).toHaveBeenCalledOnce()
  })
})
