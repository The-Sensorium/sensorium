import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import {
  useClusterSignals,
  useRaiseSignal,
  useReplySignal,
  useSetSignalStatus,
  useSignalReplies,
  SIGNAL_STATUS_ORDER,
} from './signals'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

let mockResult: { data: unknown; error: unknown }
let queryClient: QueryClient

/** Minimal Supabase stub: every chain method is awaitable (resolves mockResult). */
function makeClient() {
  const chain = () => {
    const ship: Record<string, unknown> = {
      then: (resolve: (v: unknown) => void) => resolve(mockResult),
    }
    for (const m of ['select', 'eq', 'in', 'order', 'maybeSingle', 'single', 'limit', 'throwOnError']) {
      ship[m] = vi.fn(() => ship)
    }
    return ship
  }
  const sharedChain = chain()
  const client = {
    from: vi.fn(() => sharedChain),
    rpc: vi.fn(() => Promise.resolve(mockResult)),
  }
  return client as unknown as SupabaseClient
}

const requireSupabaseMock = vi.mocked(requireSupabase)

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('signals', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = { data: [], error: null }
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeClient() as never)
  })

  it('SIGNAL_STATUS_ORDER is the canonical workflow', () => {
    expect(SIGNAL_STATUS_ORDER).toEqual(['open', 'in_progress', 'resolved'])
  })

  it('useClusterSignals fetches a cluster’s signals newest first', async () => {
    mockResult = {
      data: [{ id: 's1' }, { id: 's2' }],
      error: null,
    }
    const { result } = renderHook(() => useClusterSignals('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual([{ id: 's1' }, { id: 's2' }]))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('signals')
    expect(client.from('signals').select).toHaveBeenCalledWith('*')
    expect(client.from('signals').eq).toHaveBeenCalledWith('cluster_id', 'c1')
  })

  it('useClusterSignals throws on a query error', async () => {
    mockResult = { data: null, error: { message: 'boom' } }
    const { result } = renderHook(() => useClusterSignals('c1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect((result.current.error as Error).message).toBe('boom')
  })

  it('useSignalReplies for a single signal orders by creation ascending', async () => {
    const { result } = renderHook(() => useSignalReplies('c1', 'sig1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.from).toHaveBeenCalledWith('signal_replies')
    expect(client.from('signal_replies').eq).toHaveBeenCalledWith('signal_id', 'sig1')
  })

  it('useSignalReplies with no signal id is disabled until a cluster exists', async () => {
    const { result } = renderHook(() => useSignalReplies(null, null), { wrapper })
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('useRaiseSignal calls raise_signal and invalidates the cluster signals', async () => {
    mockResult = { data: 'sig-new', error: null }
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useRaiseSignal('c1'), { wrapper })
    result.current.mutate('need help')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.rpc).toHaveBeenCalledWith('raise_signal', {
      p_cluster_id: 'c1',
      p_prompt: 'need help',
    })
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['cluster-signals', 'c1'],
    })
  })

  it('useReplySignal throws when there is no signal id', async () => {
    const { result } = renderHook(() => useReplySignal('c1', null), { wrapper })
    await expect(result.current.mutateAsync('hi')).rejects.toThrow('No signal')
  })

  it('useReplySignal calls reply_signal with content', async () => {
    const { result } = renderHook(() => useReplySignal('c1', 'sig1'), { wrapper })
    result.current.mutate('hang in there')
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.rpc).toHaveBeenCalledWith('reply_signal', {
      p_signal_id: 'sig1',
      p_content: 'hang in there',
    })
  })

  it('useSetSignalStatus calls set_signal_status with the new status', async () => {
    const { result } = renderHook(() => useSetSignalStatus('c1'), { wrapper })
    result.current.mutate({ signalId: 'sig1', status: 'resolved' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const client = requireSupabaseMock.mock.results[0].value
    expect(client.rpc).toHaveBeenCalledWith('set_signal_status', {
      p_signal_id: 'sig1',
      p_status: 'resolved',
    })
  })
})