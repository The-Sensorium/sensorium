import { beforeEach, describe, expect, it, vi } from 'vitest'
import { router } from 'expo-router'
import { goBackWithFallback } from './use-cluster-back'

vi.mock('expo-router', () => ({
  router: {
    canGoBack: vi.fn(),
    back: vi.fn(),
    dismissTo: vi.fn(),
  },
  useFocusEffect: vi.fn(),
}))

const mockRouter = vi.mocked(router)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('goBackWithFallback', () => {
  it('walks history when a previous screen exists', () => {
    mockRouter.canGoBack.mockReturnValue(true)
    const fallback = { pathname: '/cluster/[clusterId]/room', params: { clusterId: 'c1' } } as const
    goBackWithFallback(fallback)
    expect(mockRouter.back).toHaveBeenCalledOnce()
    expect(mockRouter.dismissTo).not.toHaveBeenCalled()
  })

  it('dismisses to the fallback parent with no history', () => {
    mockRouter.canGoBack.mockReturnValue(false)
    const fallback = { pathname: '/cluster/[clusterId]/room', params: { clusterId: 'c1' } } as const
    goBackWithFallback(fallback)
    expect(mockRouter.back).not.toHaveBeenCalled()
    expect(mockRouter.dismissTo).toHaveBeenCalledWith(fallback)
  })
})
