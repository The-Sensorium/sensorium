import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, asError, type MockSupabaseResult } from '../test/supabase-client'
import { useClusterActivity, useMetricsOverview, useModeBreakdown, useRetention } from './metrics'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))
vi.mock('../app/auth-context', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/auth-context')>()
  return {
    ...actual,
    useAuth: vi.fn(() => ({ state: 'signedIn', userId: 'admin1', email: 'admin@test' })),
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

describe('metrics', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'admin1', email: 'admin@test' } as never)
  })

  it('useMetricsOverview unwraps the single overview row', async () => {
    mockResult.value = {
      data: [{ total_clusters: 3, active_clusters: 2, daily_active_clusters: 1, messages_30d: 40, avg_clusters_per_user: 1.5 }],
      error: null,
    }
    const { result } = renderHook(() => useMetricsOverview(), { wrapper })
    await waitFor(() => expect(result.current.data?.total_clusters).toBe(3))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_metrics_overview')
  })

  it('useMetricsOverview throws when the RPC returns no rows', async () => {
    mockResult.value = { data: [], error: null }
    const { result } = renderHook(() => useMetricsOverview(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('useRetention returns cohort rows', async () => {
    mockResult.value = {
      data: [{ cohort_days: 7, formed: 2, retained: 1, rate: 0.5 }],
      error: null,
    }
    const { result } = renderHook(() => useRetention(), { wrapper })
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_retention')
  })

  it('useModeBreakdown returns per-mode rows', async () => {
    mockResult.value = {
      data: [{ mode: 'generation', clusters_formed: 1, queue_joins: 5, avg_queue_depth: 2.5, max_oldest_wait_hours: 9, active_clusters: 1, avg_messages_per_cluster: 30 }],
      error: null,
    }
    const { result } = renderHook(() => useModeBreakdown(), { wrapper })
    await waitFor(() => expect(result.current.data?.[0]?.mode).toBe('generation'))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_mode_breakdown')
  })

  it('useClusterActivity passes the limit through', async () => {
    mockResult.value = { data: [], error: null }
    const { result } = renderHook(() => useClusterActivity(10), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([]))
    expect(requireSupabaseMock.mock.results[0].value.rpc).toHaveBeenCalledWith('get_cluster_activity', { p_limit: 10 })
  })

  it('hooks stay disabled when signed out', async () => {
    useAuthMock.mockReturnValue({ state: 'signedOut' } as never)
    const { result } = renderHook(() => useRetention(), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('hook errors surface RPC failures', async () => {
    mockResult.value = asError('not_authorized')
    const { result } = renderHook(() => useModeBreakdown(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
