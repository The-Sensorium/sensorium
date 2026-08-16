import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { requireSupabase } from '../lib/supabase'
import { useAuth } from '../app/auth-context'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import { REPORT_REASONS, useDeleteAccount, useReportMember } from './moderation'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../app/auth-context', () => ({ useAuth: vi.fn() }))

const requireSupabaseMock = vi.mocked(requireSupabase)
const useAuthMock = vi.mocked(useAuth)

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
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.c' })
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

  it('useDeleteAccount reclaims the avatar and authored chat images', async () => {
    const removeAvatar = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const removeChatImage = vi.fn(() => Promise.resolve({ data: [], error: null }))
    const chain = (value: MockSupabaseResult) => {
      const ship: Record<string, unknown> = {
        then: (resolve: (v: unknown) => void) => resolve(value),
      }
      for (const m of ['select', 'eq', 'maybeSingle', 'not', 'order', 'limit']) ship[m] = vi.fn(() => ship)
      return ship
    }
    const tables: Record<string, MockSupabaseResult> = {
      profiles: { data: { avatar_url: 'u1/av.png' }, error: null },
      messages: {
        data: [{ image_url: 'c1/a.png' }, { image_url: 'c2/b.png' }],
        error: null,
      },
    }
    requireSupabaseMock.mockReturnValue({
      from: vi.fn((table: string) => chain(tables[table])),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
      auth: { signOut: vi.fn(() => Promise.resolve()) },
      storage: {
        from: vi.fn((bucket: string) => ({
          remove: bucket === 'avatars' ? removeAvatar : removeChatImage,
        })),
      },
    } as never)

    const { result } = renderHook(() => useDeleteAccount(), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(removeAvatar).toHaveBeenCalledWith(['u1/av.png'])
    expect(removeChatImage).toHaveBeenCalledWith(['c1/a.png'])
    expect(removeChatImage).toHaveBeenCalledWith(['c2/b.png'])
  })
})