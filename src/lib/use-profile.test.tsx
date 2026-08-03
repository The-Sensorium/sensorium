import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import { profileKey, useProfile } from './use-profile'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../app/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/auth-context')>()
  return {
    ...actual,
    useAuth: vi.fn(() => ({ state: 'signedIn', userId: 'u1', email: 'a@b.test' })),
  }
})

const requireSupabaseMock = vi.mocked(requireSupabase)
const useAuthMock = vi.mocked(useAuth)

let mockResult: { value: MockSupabaseResult }
let queryClient: QueryClient

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('profileKey', () => {
  it('scopes the query key by user id', () => {
    expect(profileKey('user-1')).toEqual(['profile', 'user-1'])
    expect(profileKey('user-2')).not.toEqual(profileKey('user-1'))
  })
})

describe('useProfile', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it('reads the signed-in user’s own profile', async () => {
    mockResult.value = { data: { id: 'u1', display_name: 'Ally' }, error: null }
    const { result } = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(result.current.data?.display_name).toBe('Ally'))
    const c = requireSupabaseMock.mock.results[0].value
    expect(c.from('profiles').eq).toHaveBeenCalledWith('id', 'u1')
  })

  it('is disabled while signed out', () => {
    useAuthMock.mockReturnValue({ state: 'signedOut' } as never)
    renderHook(() => useProfile(), { wrapper })
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('propagates a query error', async () => {
    mockResult.value = asError('pg down')
    const { result } = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('pg down')
  })
})