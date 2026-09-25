import { beforeEach, describe, expect, it, vi } from 'vitest'
import { router } from 'expo-router'
import { goHome, goLogin, goRestricted, resetTo } from './auth-navigation'

vi.mock('expo-router', () => ({
  router: {
    canDismiss: vi.fn(),
    dismissAll: vi.fn(),
    replace: vi.fn(),
  },
}))

const mockRouter = vi.mocked(router)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('goHome', () => {
  it('clears dismissible screens before replacing with home', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    goHome()
    expect(mockRouter.dismissAll).toHaveBeenCalledOnce()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home')
  })

  it('replaces with home when there is nothing to dismiss', () => {
    mockRouter.canDismiss.mockReturnValue(false)
    goHome()
    expect(mockRouter.dismissAll).not.toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home')
  })

  it('still replaces with home when dismiss throws', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    mockRouter.dismissAll.mockImplementationOnce(() => {
      throw new Error('nothing to dismiss')
    })
    goHome()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/home')
  })
})

describe('goLogin', () => {
  it('clears dismissible screens before replacing with login', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    goLogin()
    expect(mockRouter.dismissAll).toHaveBeenCalledOnce()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })

  it('replaces with login when there is nothing to dismiss', () => {
    mockRouter.canDismiss.mockReturnValue(false)
    goLogin()
    expect(mockRouter.dismissAll).not.toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })

  it('still replaces with login when dismiss throws', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    mockRouter.dismissAll.mockImplementationOnce(() => {
      throw new Error('nothing to dismiss')
    })
    goLogin()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/login')
  })
})

describe('goRestricted', () => {
  it('clears dismissible screens before replacing with restricted', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    goRestricted()
    expect(mockRouter.dismissAll).toHaveBeenCalledOnce()
    expect(mockRouter.replace).toHaveBeenCalledWith('/restricted')
  })

  it('replaces with restricted when there is nothing to dismiss', () => {
    mockRouter.canDismiss.mockReturnValue(false)
    goRestricted()
    expect(mockRouter.dismissAll).not.toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith('/restricted')
  })

  it('still replaces with restricted when dismiss throws', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    mockRouter.dismissAll.mockImplementationOnce(() => {
      throw new Error('nothing to dismiss')
    })
    goRestricted()
    expect(mockRouter.replace).toHaveBeenCalledWith('/restricted')
  })
})

describe('resetTo', () => {
  it('replaces with an arbitrary href', () => {
    mockRouter.canDismiss.mockReturnValue(false)
    resetTo('/(auth)/reset-password')
    expect(mockRouter.dismissAll).not.toHaveBeenCalled()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/reset-password')
  })

  it('clears dismissible screens before replacing with an arbitrary href', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    resetTo('/(auth)/reset-password')
    expect(mockRouter.dismissAll).toHaveBeenCalledOnce()
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/reset-password')
  })

  it('still replaces when dismiss throws', () => {
    mockRouter.canDismiss.mockReturnValue(true)
    mockRouter.dismissAll.mockImplementationOnce(() => {
      throw new Error('nothing to dismiss')
    })
    resetTo('/(auth)/reset-password')
    expect(mockRouter.replace).toHaveBeenCalledWith('/(auth)/reset-password')
  })
})
