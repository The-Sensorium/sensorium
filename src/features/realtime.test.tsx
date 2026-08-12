import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../app/auth-context'
import { requireSupabase } from '../lib/supabase'
import { makeSupabaseClient, initialMockResult, type MockSupabaseResult } from '../test/supabase-client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useClusterChannel, usePresence } from './realtime'

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

interface ChannelCall {
  table?: string
  event?: string
  handler: (...args: never[]) => void
}

function channelHandlers(client: SupabaseClient): ChannelCall[] {
  const channel = (client.channel as unknown as ReturnType<typeof vi.fn>).mock.results[0].value
  const on = channel.on as unknown as ReturnType<typeof vi.fn>
  return on.mock.calls.map((call) => ({ table: call[1]?.table, event: call[1]?.event, handler: call[2] }))
}

function findBy(channels: ChannelCall[], table: string, event: string) {
  return channels.find((c) => c.table === table && c.event === event)?.handler
}

describe('useClusterChannel', () => {
  beforeEach(() => {
    queryClient = makeQueryClient()
    mockResult = initialMockResult()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(makeSupabaseClient(mockResult) as never)
  })

  it('returns early, so no channel is created without a cluster id', () => {
    renderHook(() => useClusterChannel(null), { wrapper })
    expect(requireSupabaseMock).not.toHaveBeenCalled()
  })

  it('appends a new message to the cluster cache', () => {
    renderHook(() => useClusterChannel('c1'), { wrapper })
    const client = requireSupabaseMock.mock.results[0].value
    queryClient.setQueryData(['cluster-messages', 'c1'], [
      { id: 'm1', created_at: '2026-01-01T00:00:00Z' },
    ])
    const handler = findBy(channelHandlers(client), 'messages', 'INSERT')
    act(() => {
      handler?.({ new: { id: 'm2', created_at: '2026-01-02T00:00:00Z' } } as never)
    })
    expect(queryClient.getQueryData(['cluster-messages', 'c1'])).toEqual([
      { id: 'm1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', created_at: '2026-01-02T00:00:00Z' },
    ])
  })

  it('replaces a message on UPDATE', () => {
    renderHook(() => useClusterChannel('c1'), { wrapper })
    queryClient.setQueryData(['cluster-messages', 'c1'], [{ id: 'm1', content: 'old' }])
    const handler = findBy(channelHandlers(requireSupabaseMock.mock.results[0].value), 'messages', 'UPDATE')
    act(() => {
      handler?.({ new: { id: 'm1', content: 'new' } } as never)
    })
    expect(queryClient.getQueryData(['cluster-messages', 'c1'])).toEqual([{ id: 'm1', content: 'new' }])
  })

  it('routes a reaction INSERT to its cluster cache', async () => {
    renderHook(() => useClusterChannel('c1'), { wrapper })
    mockResult.value = { data: { cluster_id: 'c1' }, error: null }
    queryClient.setQueryData(['cluster-reactions', 'c1'], [])
    const handler = findBy(channelHandlers(requireSupabaseMock.mock.results[0].value), 'message_reactions', 'INSERT')
    act(() => {
      handler?.({ new: { id: 'r1', message_id: 'm1', user_id: 'u1', emoji: ':wave:' } } as never)
    })
    await waitFor(() =>
      expect(queryClient.getQueryData(['cluster-reactions', 'c1'])).toEqual([
        { id: 'r1', message_id: 'm1', user_id: 'u1', emoji: ':wave:' },
      ]),
    )
  })

  it('prepends a new vote into the cluster cache', () => {
    renderHook(() => useClusterChannel('c1'), { wrapper })
    queryClient.setQueryData(['cluster-votes', 'c1'], [{ id: 'v0' }])
    const handler = findBy(channelHandlers(requireSupabaseMock.mock.results[0].value), 'votes', 'INSERT')
    act(() => {
      handler?.({ new: { id: 'v1' } } as never)
    })
    expect(queryClient.getQueryData(['cluster-votes', 'c1'])).toEqual([{ id: 'v1' }, { id: 'v0' }])
  })

  it('invalidates replacement rounds when a round is inserted', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useClusterChannel('c1'), { wrapper })
    const handler = findBy(channelHandlers(requireSupabaseMock.mock.results[0].value), 'replacement_rounds', 'INSERT')
    act(() => {
      handler?.({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['replacement-round', 'c1'] })
  })

  it('invalidates cluster members when a member joins', () => {
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    renderHook(() => useClusterChannel('c1'), { wrapper })
    const handler = findBy(channelHandlers(requireSupabaseMock.mock.results[0].value), 'cluster_members', 'INSERT')
    act(() => {
      handler?.({} as never)
    })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['cluster-members', 'c1'] })
  })
})

describe('usePresence', () => {
  function presenceClient() {
    const track = vi.fn(() => Promise.resolve('ok'))
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn(),
      track,
      presenceState: vi.fn(() => ({})),
    }
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    }
    return { client, channel, track } as unknown as {
      client: SupabaseClient
      channel: { track: ReturnType<typeof vi.fn> }
      track: ReturnType<typeof vi.fn>
    }
  }

  beforeEach(() => {
    useAuthMock.mockReset()
    useAuthMock.mockReturnValue({ state: 'signedIn', userId: 'u1', email: 'a@b.test' } as never)
  })

  it("broadcasts typing via the user's channel track", async () => {
    const { client, track } = presenceClient()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(client as never)
    const { result, unmount } = renderHook(() => usePresence('c1'), { wrapper })

    act(() => {
      result.current.signalTyping()
    })
    expect(track).toHaveBeenCalledWith({ user_id: 'u1', typing: true })

    act(() => {
      result.current.resetTyping()
    })
    expect(track).toHaveBeenCalledWith({ user_id: 'u1', typing: false })

    unmount()
    // Teardown is deferred by a tick so a StrictMode remount can re-attach first.
    await waitFor(() => expect(client.removeChannel).toHaveBeenCalled())
  })

  it('re-broadcasts the latest typing state when the channel (re)subscribes', async () => {
    const { client, channel, track } = presenceClient()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(client as never)
    const { result } = renderHook(() => usePresence('c1'), { wrapper })

    const subscribeCb = channel.subscribe.mock.calls[0][0] as (status: string) => Promise<void> | void

    act(() => {
      result.current.signalTyping()
    })
    expect(track).toHaveBeenLastCalledWith({ user_id: 'u1', typing: true })

    // A re-subscribe (StrictMode remount or socket reconnect) must re-broadcast
    // the current typing state, not fall back to the initial `false`.
    await act(async () => {
      await subscribeCb('SUBSCRIBED')
    })
    expect(track).toHaveBeenLastCalledWith({ user_id: 'u1', typing: true })

    act(() => {
      result.current.resetTyping()
    })
    await act(async () => {
      await subscribeCb('SUBSCRIBED')
    })
    expect(track).toHaveBeenLastCalledWith({ user_id: 'u1', typing: false })
  })

  it('only tracks typing on state transitions, not per keystroke', async () => {
    const { client, track } = presenceClient()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(client as never)
    const { result, unmount } = renderHook(() => usePresence('c-dedupe'), { wrapper })

    act(() => {
      result.current.signalTyping()
      result.current.signalTyping()
      result.current.signalTyping()
    })
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith({ user_id: 'u1', typing: true })

    act(() => {
      result.current.resetTyping()
    })
    expect(track).toHaveBeenCalledTimes(2)
    expect(track).toHaveBeenLastCalledWith({ user_id: 'u1', typing: false })

    act(() => {
      result.current.resetTyping()
    })
    expect(track).toHaveBeenCalledTimes(2)

    unmount()
    await waitFor(() => expect(client.removeChannel).toHaveBeenCalled())
  })

  it('returns without subscribing when there is no user', () => {
    useAuthMock.mockReturnValue({ state: 'signedOut' } as never)
    const { client } = presenceClient()
    requireSupabaseMock.mockReset()
    requireSupabaseMock.mockReturnValue(client as never)
    const { result } = renderHook(() => usePresence('c1'), { wrapper })
    expect(client.channel).not.toHaveBeenCalled()
    expect(result.current.online.size).toBe(0)
  })
})