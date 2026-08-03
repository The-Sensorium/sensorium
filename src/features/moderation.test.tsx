import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import { REPORT_REASONS, useDeleteAccount, useReportMember } from './moderation'

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

describe('moderation', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
  })

  it('exposes the canonical report reasons', () => {
    expect(REPORT_REASONS.map((r) => r.value)).toEqual([
      'harassment',
      'hate_speech',
      'spam',
      'inappropriate_content',
      'other',
    ])
  })

  it('useReportMember calls report_member and invalidates reports', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useReportMember(), { wrapper })
    result.current.mutate({
      clusterId: 'c1',
      targetUserId: 'm2',
      reason: 'harassment',
      details: 'kept pinging me',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('report_member', {
      p_cluster_id: 'c1',
      p_target_user_id: 'm2',
      p_reason: 'harassment',
      p_details: 'kept pinging me',
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['reports'] })
  })

  it('useReportMember omits details when absent', async () => {
    const { result } = renderHook(() => useReportMember(), { wrapper })
    result.current.mutate({
      clusterId: 'c1',
      targetUserId: 'm2',
      reason: 'spam',
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('report_member', {
      p_cluster_id: 'c1',
      p_target_user_id: 'm2',
      p_reason: 'spam',
      p_details: undefined,
    })
  })

  it('useReportMember propagates an RPC error', async () => {
    mockResult.value = asError('self report')
    const { result } = renderHook(() => useReportMember(), { wrapper })
    await expect(
      result.current.mutateAsync({ clusterId: 'c1', targetUserId: 'm2', reason: 'other' }),
    ).rejects.toThrow('self report')
  })

  it('useDeleteAccount signs out and clears the cache', async () => {
    const client = makeSupabaseClient(mockResult)
    const signOut = vi.fn()
    client.auth = { signOut } as never
    requireSupabaseMock.mockReturnValue(client as never)
    queryClient.setQueryData(['anything'], { keep: true })
    const { result } = renderHook(() => useDeleteAccount(), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('delete_my_account')
    expect(signOut).toHaveBeenCalled()
    expect(queryClient.getQueryState(['anything'])).toBeUndefined()
  })
})