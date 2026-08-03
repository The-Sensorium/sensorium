import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { AuthContext, useAuth } from './auth-context'

describe('useAuth', () => {
  it('defaults to the unconfigured context value', () => {
    const { result } = renderHook(() => useAuth())
    expect(result.current).toEqual({ state: 'unconfigured' })
  })

  it('returns the value provided by AuthContext', () => {
    const status = { state: 'signedIn' as const, userId: 'u1', email: 'a@b.test' }
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={status}>{children}</AuthContext.Provider>
    )
    const { result } = renderHook(() => useAuth(), { wrapper })
    expect(result.current).toBe(status)
  })
})
