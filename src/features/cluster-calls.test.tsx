import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireSupabase } from '../lib/supabase'
import { initialMockResult, makeSupabaseClient } from '../test/supabase-client'
import {
  buildCallRoomName,
  CALL_TOKEN_FUNCTION,
  MAX_CALL_PARTICIPANTS,
  useActiveCall,
  useCallParticipants,
  useCallToken,
  useLeaveCall,
  useJoinCall,
  useStartCall,
} from './cluster-calls'

vi.mock('../lib/supabase', () => ({ requireSupabase: vi.fn() }))

const requireSupabaseMock = vi.mocked(requireSupabase)

let mockResult: { value: { data: unknown; error: unknown } }
let queryClient: QueryClient
let client: SupabaseClient

function wrapper({ children }: { children?: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  mockResult = initialMockResult()
  requireSupabaseMock.mockReset()
  client = makeSupabaseClient(mockResult)
  requireSupabaseMock.mockReturnValue(client as never)
})

describe('buildCallRoomName', () => {
  it('names the room after the cluster', () => {
    expect(buildCallRoomName('c1')).toBe('cluster:c1')
  })

  it('caps participants at eight', () => {
    expect(MAX_CALL_PARTICIPANTS).toBe(8)
  })
})

describe('useActiveCall', () => {
  it('returns the newest live call', async () => {
    mockResult.value = {
      data: [{ id: 'call-1', status: 'ringing' }],
      error: null,
    }
    const { result } = renderHook(() => useActiveCall('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: 'call-1', status: 'ringing' }))
  })

  it('returns null when the cluster has no live call', async () => {
    mockResult.value = { data: [], error: null }
    const { result } = renderHook(() => useActiveCall('c1'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeNull())
  })

  it('does not query without a cluster id', () => {
    renderHook(() => useActiveCall(null), { wrapper })
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })
})

describe('useCallParticipants', () => {
  it('returns the open participants', async () => {
    mockResult.value = { data: [{ call_id: 'call-1', user_id: 'u1' }], error: null }
    const { result } = renderHook(() => useCallParticipants('call-1'), { wrapper })
    await waitFor(() =>
      expect(result.current.data).toEqual([{ call_id: 'call-1', user_id: 'u1' }]),
    )
  })
})

describe('call mutations', () => {
  it('start_call returns the call id and refreshes the call caches', async () => {
    mockResult.value = { data: 'call-1', error: null }
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useStartCall('c1'), { wrapper })
    let callId = ''
    await act(async () => {
      callId = await result.current.mutateAsync()
    })
    expect(callId).toBe('call-1')
    expect(client.rpc).toHaveBeenCalledWith('start_call', { p_cluster_id: 'c1' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['active-call', 'c1'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['call-participants', 'call-1'] })
  })

  it('join_call joins and refreshes the call caches', async () => {
    mockResult.value = { data: 'call-1', error: null }
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useJoinCall('c1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('call-1')
    })
    expect(client.rpc).toHaveBeenCalledWith('join_call', { p_call_id: 'call-1' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['active-call', 'c1'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['call-participants', 'call-1'] })
  })

  it('leave_call leaves and refreshes the call caches', async () => {
    mockResult.value = { data: null, error: null }
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    const { result } = renderHook(() => useLeaveCall('c1'), { wrapper })
    await act(async () => {
      await result.current.mutateAsync('call-1')
    })
    expect(client.rpc).toHaveBeenCalledWith('leave_call', { p_call_id: 'call-1' })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['active-call', 'c1'] })
  })
})

describe('useCallToken', () => {
  it('invokes the token function with the call id', async () => {
    mockResult.value = { data: { token: 'tok', url: 'wss://calls.test' }, error: null }
    const { result } = renderHook(() => useCallToken('call-1'), { wrapper })
    await waitFor(() =>
      expect(result.current.data).toEqual({ token: 'tok', url: 'wss://calls.test' }),
    )
    expect(client.functions.invoke).toHaveBeenCalledWith(CALL_TOKEN_FUNCTION, {
      body: { call_id: 'call-1' },
    })
  })

  it('throws when the function reports an error or no token', async () => {
    mockResult.value = { data: null, error: { message: 'not_member' } }
    const { result } = renderHook(() => useCallToken('call-1'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })

  it('does not fetch without a call id', () => {
    renderHook(() => useCallToken(null), { wrapper })
    expect(client.functions.invoke).not.toHaveBeenCalled()
  })
})
