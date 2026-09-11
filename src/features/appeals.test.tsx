import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, type MockSupabaseResult } from '../test/supabase-client'
import { useClaimAppeal, useDecideAppeal, useRequestSecondReview } from './appeals'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

const requireSupabaseMock = vi.mocked(requireSupabase)

let mockResult: { value: MockSupabaseResult }
let queryClient: QueryClient

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('appeal mutations', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
  })

  it('useClaimAppeal refreshes both the v1 and v2 appeal caches', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useClaimAppeal(), { wrapper })
    result.current.mutate({ p_appeal_id: 'ap-1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'appeals'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'appeals-v2'] })
  })

  it('useRequestSecondReview refreshes the v2 appeal case', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRequestSecondReview(), { wrapper })
    result.current.mutate({ p_appeal_id: 'ap-1' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'appeals-v2'] })
  })

  it('useDecideAppeal refreshes the v2 appeal case', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useDecideAppeal(), { wrapper })
    result.current.mutate({ p_appeal_id: 'ap-1', p_accept: true, p_response: 'Welcome back' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'appeals-v2'] })
  })
})
