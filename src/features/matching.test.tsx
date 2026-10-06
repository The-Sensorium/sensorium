import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import {
  useClusterMembers,
  formatAgePrefs,
  useJoinQueue,
  useLatestClusterFormed,
  useLeaveQueue,
  useLocalCompatibleCount,
  useMyClusters,
  useMyQueueKeys,
  useMyQueueStatus,
  useQueueCount,
  useSetLocalAgePrefs,
} from './matching'

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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('matching', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it('useMyQueueStatus reads matching status from the RPC', async () => {
    mockResult.value = { data: [{ mode: 'birth_date' }], error: null }
    const { result } = renderHook(() => useMyQueueStatus(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ mode: 'birth_date' }]))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_my_matching_status')
  })

  it('useMyQueueKeys returns queue keys', async () => {
    mockResult.value = { data: [{ mode: 'local', queue_key: 'x', waiting: 3 }], error: null }
    const { result } = renderHook(() => useMyQueueKeys(), { wrapper })
    await waitFor(() => expect(result.current.data[0].queue_key).toBe('x'))
  })

  it('useMyClusters returns an empty list with no memberships', async () => {
    mockResult.value = { data: [], error: null }
    const { result } = renderHook(() => useMyClusters(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_my_clusters')
  })

  it('useMyClusters maps RPC rows to clusters with member counts', async () => {
    mockResult.value = {
      data: [
        {
          id: 'c1',
          name: 'A',
          matching_mode: 'exact_birthdate',
          mode_label: 'Mode A',
          queue_key: '2000-01-01',
          status: 'active',
          introductions_deadline: null,
          introductions_completed_at: '2026-01-03T00:00:00Z',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          joined_at: '2026-01-02T00:00:00Z',
          member_count: 8,
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useMyClusters(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((m) => m.cluster.id)).toEqual(['c1'])
    expect(result.current.data?.[0].memberCount).toBe(8)
    expect(result.current.data?.[0].joinedAt).toBe('2026-01-02T00:00:00Z')
  })

  it('useClusterMembers fetches member profiles', async () => {
    const { result } = renderHook(() => useClusterMembers('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_member_profiles', {
      p_cluster_id: 'c1',
    })
  })

  it('useClusterMembers sorts members stably by display name', async () => {
    mockResult.value = {
      data: [
        { id: 'u3', display_name: 'rio' },
        { id: 'u1', display_name: 'Diya' },
        { id: 'u2', display_name: 'diya' },
        { id: 'u4', display_name: null },
      ],
      error: null,
    }
    const { result } = renderHook(() => useClusterMembers('c1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((m) => m.id)).toEqual(['u4', 'u1', 'u2', 'u3'])
  })

  it('useQueueCount polls the RPC without a broadcast channel', async () => {
    mockResult.value = { data: 5, error: null }
    const { result } = renderHook(() => useQueueCount('local', 'k1'), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.rpc).toHaveBeenCalledWith('get_queue_count', { p_mode: 'local', p_queue_key: 'k1' })
    expect(client.channel).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.count).toBe(5))
  })

it('useQueueCount stays disabled without a queue key', () => {
    const { result } = renderHook(() => useQueueCount('birth_date', null), { wrapper })
    expect(result.current.count).toBeNull()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('useJoinQueue passes an optional radius and invalidates on success', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useJoinQueue(), { wrapper })
    result.current.mutate({ mode: 'local', radiusKm: 25 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('join_queue', {
      p_mode: 'local',
      p_radius_km: 25,
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['matching-status', 'u1'] })
  })

  it('useJoinQueue omits radius when not provided', async () => {
    const { result } = renderHook(() => useJoinQueue(), { wrapper })
    result.current.mutate({ mode: 'birth_date' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('join_queue', {
      p_mode: 'birth_date',
    })
  })

  it('useLeaveQueue invalidates queue + matching status', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useLeaveQueue(), { wrapper })
    result.current.mutate('birth_date')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['my-queues', 'u1'] })
  })

  it('useJoinQueue propagates an RPC error', async () => {
    mockResult.value = asError('queue full')
    const { result } = renderHook(() => useJoinQueue(), { wrapper })
    await expect(result.current.mutateAsync({ mode: 'birth_date' })).rejects.toThrow('queue full')
  })

  it('useLatestClusterFormed returns null when none exists', async () => {
    const { result } = renderHook(() => useLatestClusterFormed(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeNull())
  })

  it('useLatestClusterFormed returns the newest unread one', async () => {
    mockResult.value = { data: [{ id: 'n9', cluster_id: 'c1', payload: {} }], error: null }
    const { result } = renderHook(() => useLatestClusterFormed(), { wrapper })
    await waitFor(() => expect(result.current.data?.id).toBe('n9'))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from('notifications').is).toHaveBeenCalledWith('read_at', null)
  })

  it('formatAgePrefs renders Any age for nulls and full span', () => {
    expect(formatAgePrefs(null, null)).toBe('Any age')
    expect(formatAgePrefs(18, 99)).toBe('Any age')
    expect(formatAgePrefs(25, 35)).toBe('25 to 35 years')
  })

  it('useSetLocalAgePrefs calls the RPC and invalidates compatible counts', async () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useSetLocalAgePrefs(), { wrapper })
    result.current.mutate({ min: 25, max: 35 })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('set_local_age_prefs', {
      p_min: 25,
      p_max: 35,
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['local-compatible-count'] })
  })

  it('useSetLocalAgePrefs propagates an invalid range error', async () => {
    mockResult.value = asError('invalid_age_range')
    const { result } = renderHook(() => useSetLocalAgePrefs(), { wrapper })
    await expect(result.current.mutateAsync({ min: 90, max: 20 })).rejects.toThrow('invalid_age_range')
  })

  it('useLocalCompatibleCount queries the count RPC', async () => {
    mockResult.value = { data: 3, error: null }
    const { result } = renderHook(() => useLocalCompatibleCount('k1', 25, 35), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith(
      'get_local_compatible_count',
      { p_queue_key: 'k1', p_min: 25, p_max: 35 },
    )
    await waitFor(() => expect(result.current.count).toBe(3))
  })

  it('useLocalCompatibleCount stays disabled without a queue key', () => {
    const { result } = renderHook(() => useLocalCompatibleCount(null, null, null), { wrapper })
    expect(result.current.count).toBeNull()
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })
})